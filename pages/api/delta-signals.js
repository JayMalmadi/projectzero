// /api/delta-signals
// Crypto futures signals using Delta Exchange data
// Returns: signal, contracts to trade, SL price, target price, leverage suggestion

export default async function handler(req, res) {
  const { symbol = 'BTC', strategy = 'momentum' } = req.query

  const PRODUCTS = {
    BTC: { id: 27,    symbol: 'BTCUSD', contractValue: 0.001, tickSize: 0.5,    minMargin: 0.5  },
    ETH: { id: 3136,  symbol: 'ETHUSD', contractValue: 0.01,  tickSize: 0.05,   minMargin: 1.0  },
    SOL: { id: 14823, symbol: 'SOLUSD', contractValue: 1.0,   tickSize: 0.0001, minMargin: 2.0  },
    XRP: { id: 14969, symbol: 'XRPUSD', contractValue: 1.0,   tickSize: 0.0001, minMargin: 2.0  },
    BNB: { id: 15042, symbol: 'BNBUSD', contractValue: 0.1,   tickSize: 0.001,  minMargin: 2.0  },
  }

  const product = PRODUCTS[symbol.toUpperCase()]
  if (!product) return res.status(400).json({ error: `Unknown symbol. Use: ${Object.keys(PRODUCTS).join(', ')}` })

  try {
    // Fetch OHLCV data from Delta Exchange (15-min candles, 200 bars)
    const end   = Math.floor(Date.now() / 1000)
    const start = end - (200 * 900) // 200 x 15min

    const [candleR, tickerR] = await Promise.all([
      fetch(`https://api.india.delta.exchange/v2/history/candles?symbol=${product.symbol}&resolution=15&start=${start}&end=${end}`),
      fetch(`https://api.india.delta.exchange/v2/tickers/${product.symbol}`),
    ])

    const candleD = await candleR.json()
    const tickerD = await tickerR.json()

    const candles = candleD.result || []
    const ticker  = tickerD.result || {}

    if (candles.length < 50) {
      return res.status(200).json({ signal: 'HOLD', confidence: 0, price: 0, reason: 'Insufficient data' })
    }

    const closes  = candles.map(c => parseFloat(c.close))
    const highs   = candles.map(c => parseFloat(c.high))
    const lows    = candles.map(c => parseFloat(c.low))
    const volumes = candles.map(c => parseFloat(c.volume))
    const price   = parseFloat(ticker.mark_price || closes[closes.length - 1])
    const fundingRate = parseFloat(ticker.funding_rate || 0)

    // ── Indicators ──────────────────────────────────────────────
    function ema(data, period) {
      const k = 2 / (period + 1)
      let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period
      for (let i = period; i < data.length; i++) val = data[i] * k + val * (1 - k)
      return val
    }

    function rsi(data, period = 14) {
      let gains = 0, losses = 0
      const slice = data.slice(-period - 1)
      for (let i = 0; i < slice.length - 1; i++) {
        const d = slice[i + 1] - slice[i]
        if (d > 0) gains += d; else losses -= d
      }
      const avgG = gains / period
      const avgL = losses / period || 0.0001
      return 100 - (100 / (1 + avgG / avgL))
    }

    function atr(highs, lows, closes, period = 14) {
      const trs = []
      for (let i = 1; i < closes.length; i++) {
        trs.push(Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        ))
      }
      return trs.slice(-period).reduce((a, b) => a + b, 0) / period
    }

    const EMA9  = ema(closes, 9)
    const EMA21 = ema(closes, 21)
    const EMA50 = ema(closes, 50)
    const RSI   = rsi(closes)
    const ATR   = atr(highs, lows, closes)
    const macdLine  = ema(closes, 12) - ema(closes, 26)
    const prevMacd  = ema(closes.slice(0, -1), 12) - ema(closes.slice(0, -1), 26)
    const volAvg    = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
    const volRatio  = volumes[volumes.length - 1] / (volAvg || 1)
    const bbSlice   = closes.slice(-20)
    const bbMean    = bbSlice.reduce((a, b) => a + b, 0) / 20
    const bbStd     = Math.sqrt(bbSlice.reduce((a, b) => a + (b - bbMean) ** 2, 0) / 20)
    const bbUpper   = bbMean + 2 * bbStd
    const bbLower   = bbMean - 2 * bbStd

    let signal = 'HOLD', confidence = 25, stopLoss = null, target = null, reason = ''

    if (strategy === 'momentum') {
      const bullish = EMA9 > EMA21 && EMA21 > EMA50 && RSI > 50 && RSI < 72 && macdLine > 0 && macdLine > prevMacd && volRatio > 1.1
      const bearish = EMA9 < EMA21 && EMA21 < EMA50 && RSI < 50 && RSI > 28 && macdLine < 0 && macdLine < prevMacd && volRatio > 1.1
      if (bullish) {
        signal = 'BUY'; confidence = Math.min(95, 60 + (RSI - 50) + (volRatio - 1) * 10)
        stopLoss = price - ATR * 2; target = price + ATR * 3
        reason = `EMA9>EMA21>EMA50 bullish stack. RSI ${RSI.toFixed(0)} momentum. MACD rising. Volume ${volRatio.toFixed(1)}x`
      } else if (bearish) {
        signal = 'SELL'; confidence = Math.min(95, 60 + (50 - RSI) + (volRatio - 1) * 10)
        stopLoss = price + ATR * 2; target = price - ATR * 3
        reason = `EMA bearish stack. RSI ${RSI.toFixed(0)} momentum down. MACD falling. Volume ${volRatio.toFixed(1)}x`
      } else {
        reason = `EMAs not aligned. RSI=${RSI.toFixed(0)}. Waiting for clear trend.`
      }
    } else if (strategy === 'rsi-reversal') {
      if (RSI < 30 && price <= bbLower * 1.005) {
        signal = 'BUY'; confidence = Math.min(90, 70 + (30 - RSI))
        stopLoss = bbLower - ATR; target = bbMean
        reason = `RSI ${RSI.toFixed(0)} oversold + price at BB lower. Mean reversion setup.`
      } else if (RSI > 70 && price >= bbUpper * 0.995) {
        signal = 'SELL'; confidence = Math.min(90, 70 + (RSI - 70))
        stopLoss = bbUpper + ATR; target = bbMean
        reason = `RSI ${RSI.toFixed(0)} overbought + price at BB upper. Mean reversion setup.`
      } else {
        reason = `RSI ${RSI.toFixed(0)} — not at extreme. Waiting for oversold/overbought.`
      }
    } else if (strategy === 'macd-cross') {
      const crossUp   = macdLine > 0 && prevMacd <= 0
      const crossDown = macdLine < 0 && prevMacd >= 0
      if (crossUp && price > EMA50) {
        signal = 'BUY'; confidence = 72
        stopLoss = price - ATR * 1.8; target = price + ATR * 2.8
        reason = `MACD bullish crossover above zero. Price above EMA50.`
      } else if (crossDown && price < EMA50) {
        signal = 'SELL'; confidence = 72
        stopLoss = price + ATR * 1.8; target = price - ATR * 2.8
        reason = `MACD bearish crossover below zero. Price below EMA50.`
      } else {
        reason = `No fresh MACD crossover. macdLine=${macdLine.toFixed(2)}`
      }
    } else if (strategy === 'bb-squeeze') {
      const prevClose = closes[closes.length - 2]
      if (price > bbUpper && prevClose <= bbUpper && volRatio > 1.2) {
        signal = 'BUY'; confidence = 75
        stopLoss = bbMean; target = bbUpper + (bbUpper - bbMean)
        reason = `BB breakout above upper band. Volume ${volRatio.toFixed(1)}x confirming.`
      } else if (price < bbLower && prevClose >= bbLower && volRatio > 1.2) {
        signal = 'SELL'; confidence = 75
        stopLoss = bbMean; target = bbLower - (bbMean - bbLower)
        reason = `BB breakdown below lower band. Volume ${volRatio.toFixed(1)}x confirming.`
      } else {
        reason = `Price inside BB bands. Waiting for breakout. BB width=${((bbUpper-bbLower)/bbMean*100).toFixed(1)}%`
      }
    }

    // Round SL and target to tick size
    const roundTick = (v, tick) => v ? Math.round(v / tick) * tick : null
    const tick = parseFloat(product.tickSize)
    stopLoss = roundTick(stopLoss, tick)
    target   = roundTick(target, tick)

    const rr = stopLoss && target
      ? Math.abs(target - price) / Math.abs(stopLoss - price)
      : null

    // Contract size calculation for $25 risk per trade (conservative default)
    // Contracts = riskUSD / (ATR * 2 * contractValue)
    const riskPerTrade = 25 // USD
    const contractsFor25USD = stopLoss
      ? Math.max(1, Math.floor(riskPerTrade / (Math.abs(price - stopLoss) * product.contractValue)))
      : 1

    // Funding rate impact on signal
    const fundingWarning = Math.abs(fundingRate) > 0.001
      ? `⚠️ Funding rate ${(fundingRate * 100).toFixed(3)}% — ${fundingRate > 0 ? 'longs pay shorts' : 'shorts pay longs'}`
      : null

    return res.status(200).json({
      status:     'success',
      symbol,
      strategy,
      signal,
      confidence: Math.round(confidence),
      price,
      stopLoss,
      target,
      rr:         rr ? parseFloat(rr.toFixed(2)) : null,
      contractsFor25USD,
      productId:  product.id,
      contractValue: product.contractValue,
      indicators: {
        rsi:      parseFloat(RSI.toFixed(1)),
        ema9:     parseFloat(EMA9.toFixed(2)),
        ema21:    parseFloat(EMA21.toFixed(2)),
        ema50:    parseFloat(EMA50.toFixed(2)),
        atr:      parseFloat(ATR.toFixed(2)),
        macd:     parseFloat(macdLine.toFixed(4)),
        bbUpper:  parseFloat(bbUpper.toFixed(2)),
        bbLower:  parseFloat(bbLower.toFixed(2)),
        volRatio: parseFloat(volRatio.toFixed(2)),
        fundingRate,
      },
      reason,
      fundingWarning,
      source: 'delta-exchange',
    })

  } catch (err) {
    console.error('Delta signals error:', err)
    return res.status(500).json({ error: err.message, signal: 'HOLD', confidence: 0 })
  }
}
