// pages/api/crypto-signals.js
// Crypto trading signals using Binance price data
// Strategies: Momentum, Breakout, RSI Reversal

export default async function handler(req, res) {
  const { symbol = 'BTC', strategy = 'momentum' } = req.query

  try {
    const SYMBOLS = {
      BTC:'BTCUSDT', ETH:'ETHUSDT', SOL:'SOLUSDT',
      BNB:'BNBUSDT', XRP:'XRPUSDT', DOGE:'DOGEUSDT',
    }

    const binanceSym = SYMBOLS[symbol] || `${symbol}USDT`

    // Fetch 100 candles for analysis (15m timeframe)
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=15m&limit=100`)
    const klines = await r.json()

    if (!Array.isArray(klines) || klines.length < 20) {
      return res.status(500).json({ error: 'Not enough data', signal: 'HOLD' })
    }

    const closes  = klines.map(k => parseFloat(k[4]))
    const highs   = klines.map(k => parseFloat(k[2]))
    const lows    = klines.map(k => parseFloat(k[3]))
    const volumes = klines.map(k => parseFloat(k[5]))
    const price   = closes[closes.length - 1]

    // ── Indicators ────────────────────────────────────────────────
    // RSI (14)
    function calcRSI(data, period=14) {
      let gains = 0, losses = 0
      for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i-1]
        if (diff > 0) gains += diff
        else losses -= diff
      }
      let avgGain = gains / period
      let avgLoss = losses / period
      for (let i = period+1; i < data.length; i++) {
        const diff = data[i] - data[i-1]
        avgGain = (avgGain * (period-1) + (diff > 0 ? diff : 0)) / period
        avgLoss = (avgLoss * (period-1) + (diff < 0 ? -diff : 0)) / period
      }
      const rs = avgGain / (avgLoss || 0.001)
      return 100 - (100 / (1 + rs))
    }

    // EMA
    function calcEMA(data, period) {
      const k = 2 / (period + 1)
      let ema = data.slice(0, period).reduce((a,b) => a+b, 0) / period
      for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k)
      }
      return ema
    }

    // Volume avg
    const volAvg = volumes.slice(-20).reduce((a,b)=>a+b,0) / 20
    const volNow = volumes[volumes.length-1]
    const volRatio = volNow / volAvg

    const rsi     = calcRSI(closes)
    const ema9    = calcEMA(closes, 9)
    const ema21   = calcEMA(closes, 21)
    const ema50   = calcEMA(closes, 50)

    // Recent high/low (20 candles = ORB equivalent)
    const recentHighs = highs.slice(-20)
    const recentLows  = lows.slice(-20)
    const rangeHigh   = Math.max(...recentHighs.slice(0, 4))  // first 4 candles = opening range
    const rangeLow    = Math.min(...recentLows.slice(0, 4))

    let signal = 'HOLD', confidence = 30, reason = '', stopLoss = null, target = null

    // ── Strategy 1: Momentum (EMA crossover + volume) ─────────────
    if (strategy === 'momentum') {
      const emaBullish  = ema9 > ema21 && ema21 > ema50
      const emaBearish  = ema9 < ema21 && ema21 < ema50
      const highVolume  = volRatio > 1.3
      const rsiBullZone = rsi > 50 && rsi < 70
      const rsiBearZone = rsi < 50 && rsi > 30

      if (emaBullish && rsiBullZone && highVolume) {
        signal = 'BUY'; confidence = 72
        stopLoss = parseFloat((price * 0.982).toFixed(2))
        target   = parseFloat((price * 1.035).toFixed(2))
        reason   = `EMA9 > EMA21 > EMA50 (bullish alignment). RSI ${rsi.toFixed(0)} in healthy zone. Volume ${volRatio.toFixed(1)}x avg confirms momentum.`
      } else if (emaBearish && rsiBearZone && highVolume) {
        signal = 'SELL'; confidence = 68
        stopLoss = parseFloat((price * 1.018).toFixed(2))
        target   = parseFloat((price * 0.965).toFixed(2))
        reason   = `EMA9 < EMA21 < EMA50 (bearish alignment). RSI ${rsi.toFixed(0)} in bearish zone. Volume ${volRatio.toFixed(1)}x avg confirms selling pressure.`
      } else {
        confidence = 25
        reason = `No clear momentum. EMA alignment mixed. RSI ${rsi.toFixed(0)}. Volume ${volRatio.toFixed(1)}x avg. Wait for clearer setup.`
      }
    }

    // ── Strategy 2: RSI Reversal ───────────────────────────────────
    else if (strategy === 'rsi-reversal') {
      const oversold    = rsi < 32
      const overbought  = rsi > 68
      const priceAboveEma = price > ema21
      const priceBelowEma = price < ema21

      if (oversold && priceAboveEma) {
        signal = 'BUY'; confidence = 65
        stopLoss = parseFloat((price * 0.978).toFixed(2))
        target   = parseFloat((price * 1.030).toFixed(2))
        reason   = `RSI ${rsi.toFixed(0)} — oversold territory. Price holding above EMA21 support. Bounce setup.`
      } else if (overbought && priceBelowEma) {
        signal = 'SELL'; confidence = 63
        stopLoss = parseFloat((price * 1.022).toFixed(2))
        target   = parseFloat((price * 0.970).toFixed(2))
        reason   = `RSI ${rsi.toFixed(0)} — overbought. Price below EMA21 resistance. Pullback likely.`
      } else {
        confidence = 20
        reason = `RSI ${rsi.toFixed(0)} — neutral zone. No reversal setup yet. Wait for RSI < 32 or > 68.`
      }
    }

    // ── Strategy 3: Breakout (Range breakout) ─────────────────────
    else if (strategy === 'breakout') {
      const rangeSize = rangeHigh - rangeLow
      const breakoutUp   = price > rangeHigh * 1.002 && volRatio > 1.4
      const breakoutDown = price < rangeLow  * 0.998 && volRatio > 1.4

      if (breakoutUp) {
        signal = 'BUY'; confidence = 70
        stopLoss = parseFloat((rangeLow).toFixed(2))
        target   = parseFloat((price + rangeSize * 1.5).toFixed(2))
        reason   = `Price broke above 20-candle range high ($${rangeHigh.toFixed(2)}) with ${volRatio.toFixed(1)}x volume. Target = 1.5x range extension.`
      } else if (breakoutDown) {
        signal = 'SELL'; confidence = 68
        stopLoss = parseFloat((rangeHigh).toFixed(2))
        target   = parseFloat((price - rangeSize * 1.5).toFixed(2))
        reason   = `Price broke below 20-candle range low ($${rangeLow.toFixed(2)}) with ${volRatio.toFixed(1)}x volume. Breakdown continuation setup.`
      } else {
        confidence = 22
        reason = `Price inside range ($${rangeLow.toFixed(2)} - $${rangeHigh.toFixed(2)}). No breakout yet. Volume ${volRatio.toFixed(1)}x. Wait for clean break with volume > 1.4x.`
      }
    }

    // Chart data for mini chart (last 50 candles)
    const chartData = klines.slice(-50).map((k, i) => ({
      date:  new Date(parseInt(k[0])).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))

    return res.status(200).json({
      status: 'success',
      symbol, strategy, signal, confidence,
      price, stopLoss, target, reason,
      indicators: {
        rsi: parseFloat(rsi.toFixed(1)),
        ema9: parseFloat(ema9.toFixed(2)),
        ema21: parseFloat(ema21.toFixed(2)),
        ema50: parseFloat(ema50.toFixed(2)),
        volRatio: parseFloat(volRatio.toFixed(2)),
      },
      chartData,
      market: 'crypto',
      exchange: 'binance',
    })

  } catch (err) {
    console.error('Crypto signals error:', err)
    return res.status(500).json({ error: err.message, signal: 'HOLD' })
  }
}
