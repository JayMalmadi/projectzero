// /api/backtest
// Run any PZ strategy against historical NSE/Crypto data
// Returns: win rate, avg P&L, max drawdown, best/worst trade, equity curve

export default async function handler(req, res) {
  const { symbol, strategy, market = 'india', period = '1year' } = req.query

  try {
    // Fetch historical data
    const days = period === '6months' ? 180 : period === '3months' ? 90 : 365
    let candles = []

    if (market === 'crypto') {
      // Binance: get daily candles
      const SYMS = {BTC:'BTCUSDT',ETH:'ETHUSDT',SOL:'SOLUSDT',BNB:'BNBUSDT',XRP:'XRPUSDT',DOGE:'DOGEUSDT'}
      const binSym = SYMS[symbol] || `${symbol}USDT`
      const r = await fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=1d&limit=${Math.min(days,365)}`)
      const data = await r.json()
      if (Array.isArray(data)) {
        candles = data.map(k => ({
          date:   new Date(parseInt(k[0])).toISOString().split('T')[0],
          open:   parseFloat(k[1]),
          high:   parseFloat(k[2]),
          low:    parseFloat(k[3]),
          close:  parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
      }
    } else {
      // Yahoo Finance: historical NSE data
      const yahooMap = {
        NIFTY:'%5ENSEI', BANKNIFTY:'%5ENSEBANK', SENSEX:'%5EBSESN',
        TCS:'TCS.NS', INFY:'INFY.NS', RELIANCE:'RELIANCE.NS',
        HDFCBANK:'HDFCBANK.NS', ICICIBANK:'ICICIBANK.NS', SBIN:'SBIN.NS',
      }
      const ticker = yahooMap[symbol] || `${symbol}.NS`
      const end   = Math.floor(Date.now() / 1000)
      const start = end - (days * 86400)
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${start}&period2=${end}`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      const data = await r.json()
      const result = data?.chart?.result?.[0]
      if (result) {
        const timestamps = result.timestamp || []
        const q = result.indicators?.quote?.[0] || {}
        candles = timestamps.map((ts, i) => ({
          date:   new Date(ts * 1000).toISOString().split('T')[0],
          open:   q.open?.[i],
          high:   q.high?.[i],
          low:    q.low?.[i],
          close:  q.close?.[i],
          volume: q.volume?.[i],
        })).filter(c => c.close != null)
      }
    }

    if (candles.length < 30) {
      return res.status(400).json({ error: 'Not enough historical data', candles: candles.length })
    }

    // Helper functions
    function ema(data, p) {
      const k = 2/(p+1)
      let v = data.slice(0, p).reduce((a,b)=>a+b,0)/p
      for (let i=p; i<data.length; i++) v = data[i]*k + v*(1-k)
      return v
    }
    function emaArr(data, p) {
      const k=2/(p+1), out=new Array(data.length).fill(0)
      out[p-1] = data.slice(0,p).reduce((a,b)=>a+b,0)/p
      for (let i=p; i<data.length; i++) out[i] = data[i]*k + out[i-1]*(1-k)
      return out
    }
    function rsiCalc(data, p=14) {
      let g=0, l=0
      const slice = data.slice(-p-1)
      for (let i=0; i<slice.length-1; i++) {
        const d = slice[i+1] - slice[i]
        if (d>0) g+=d; else l-=d
      }
      const ag=g/p, al=l/p||0.0001
      return 100-(100/(1+ag/al))
    }
    function atrCalc(highs, lows, closes, p=14) {
      const trs = []
      for (let i=1; i<closes.length; i++) {
        trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])))
      }
      return trs.slice(-p).reduce((a,b)=>a+b,0)/p
    }

    // Walk-forward backtest — simulate trading day by day
    const trades = []
    const WINDOW = 50  // minimum candles needed to calculate indicators
    let inTrade = null

    for (let i = WINDOW; i < candles.length; i++) {
      const slice   = candles.slice(0, i+1)
      const closes  = slice.map(c => c.close)
      const highs   = slice.map(c => c.high)
      const lows    = slice.map(c => c.low)
      const volumes = slice.map(c => c.volume)
      const price   = closes[closes.length-1]
      const date    = slice[slice.length-1].date

      // Check if in-trade exit conditions met
      if (inTrade) {
        const hitSL = inTrade.direction === 'BUY'
          ? price <= inTrade.stopLoss
          : price >= inTrade.stopLoss
        const hitTarget = inTrade.direction === 'BUY'
          ? price >= inTrade.target
          : price <= inTrade.target

        if (hitSL || hitTarget) {
          const pnlPct = inTrade.direction === 'BUY'
            ? ((price - inTrade.entry) / inTrade.entry * 100)
            : ((inTrade.entry - price) / inTrade.entry * 100)
          trades.push({
            entry: inTrade.entry,
            exit:  price,
            direction: inTrade.direction,
            entryDate: inTrade.date,
            exitDate: date,
            pnlPct: parseFloat(pnlPct.toFixed(2)),
            result: hitTarget ? 'WIN' : 'LOSS',
            strategy,
          })
          inTrade = null
        }
        continue  // don't open new trade while in one
      }

      // Calculate indicators
      const rsiVal  = rsiCalc(closes)
      const ema9v   = ema(closes, 9)
      const ema21v  = ema(closes, 21)
      const ema50v  = ema(closes, 50)
      const atrVal  = atrCalc(highs, lows, closes)
      const volAvg  = volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20
      const volRatio = volumes[volumes.length-1]/(volAvg||1)
      const macdE12 = ema(closes, 12), macdE26 = ema(closes, 26)
      const macdLine = macdE12 - macdE26
      const prevMacd = ema(closes.slice(0,-1), 12) - ema(closes.slice(0,-1), 26)
      const bbSlice = closes.slice(-20)
      const bbMean  = bbSlice.reduce((a,b)=>a+b,0)/20
      const bbStd   = Math.sqrt(bbSlice.reduce((a,b)=>a+(b-bbMean)**2,0)/20)
      const bbUpper = bbMean + 2*bbStd, bbLower = bbMean - 2*bbStd

      let signal = null, stopLoss = null, target = null

      if (strategy === 'supertrend' || strategy === 'momentum') {
        const bullish = ema9v > ema21v && ema21v > ema50v && rsiVal > 50 && rsiVal < 70 && macdLine > 0 && macdLine > prevMacd
        const bearish = ema9v < ema21v && ema21v < ema50v && rsiVal < 50 && rsiVal > 30 && macdLine < 0 && macdLine < prevMacd
        if (bullish && volRatio > 1.1) {
          signal = 'BUY'
          stopLoss = price - atrVal*2
          target   = price + atrVal*3
        } else if (bearish && volRatio > 1.1) {
          signal = 'SELL'
          stopLoss = price + atrVal*2
          target   = price - atrVal*3
        }
      } else if (strategy === 'rsi-reversal' || strategy === 'vwap') {
        if (rsiVal < 32 && price <= bbLower*1.002) {
          signal   = 'BUY'
          stopLoss = bbLower - atrVal
          target   = bbMean
        } else if (rsiVal > 68 && price >= bbUpper*0.998) {
          signal   = 'SELL'
          stopLoss = bbUpper + atrVal
          target   = bbMean
        }
      } else if (strategy === 'macd' || strategy === 'macd-cross') {
        const crossUp   = macdLine > 0 && prevMacd <= 0
        const crossDown = macdLine < 0 && prevMacd >= 0
        if (crossUp && price > ema50v) {
          signal = 'BUY'
          stopLoss = price - atrVal*1.8
          target   = price + atrVal*2.8
        } else if (crossDown && price < ema50v) {
          signal = 'SELL'
          stopLoss = price + atrVal*1.8
          target   = price - atrVal*2.8
        }
      } else if (strategy === 'bollinger' || strategy === 'bb-breakout') {
        const prevClose = closes[closes.length-2]
        if (price > bbUpper && prevClose <= bbUpper && volRatio > 1.2) {
          signal = 'BUY'
          stopLoss = bbMean
          target   = bbUpper + (bbUpper - bbMean)
        } else if (price < bbLower && prevClose >= bbLower && volRatio > 1.2) {
          signal = 'SELL'
          stopLoss = bbMean
          target   = bbLower - (bbMean - bbLower)
        }
      }

      if (signal && stopLoss && target) {
        inTrade = { direction: signal, entry: price, stopLoss, target, date }
      }
    }

    // Calculate stats
    const wins    = trades.filter(t => t.result === 'WIN')
    const losses  = trades.filter(t => t.result === 'LOSS')
    const winRate = trades.length > 0 ? parseFloat((wins.length / trades.length * 100).toFixed(1)) : 0
    const avgWin  = wins.length > 0   ? parseFloat((wins.reduce((a,t) => a+t.pnlPct, 0)/wins.length).toFixed(2)) : 0
    const avgLoss = losses.length > 0 ? parseFloat((losses.reduce((a,t) => a+t.pnlPct, 0)/losses.length).toFixed(2)) : 0
    const totalPnl = parseFloat(trades.reduce((a,t) => a+t.pnlPct, 0).toFixed(2))
    const expectancy = trades.length > 0 ? parseFloat(((winRate/100 * avgWin) + ((1-winRate/100) * avgLoss)).toFixed(3)) : 0

    // Equity curve
    let equity = 100
    const equityCurve = trades.map(t => {
      equity = equity * (1 + t.pnlPct/100)
      return { date: t.exitDate, equity: parseFloat(equity.toFixed(2)) }
    })

    // Max drawdown
    let peak = 100, maxDD = 0, runningEq = 100
    for (const t of trades) {
      runningEq = runningEq * (1 + t.pnlPct/100)
      if (runningEq > peak) peak = runningEq
      const dd = (peak - runningEq) / peak * 100
      if (dd > maxDD) maxDD = dd
    }

    // Best/worst trade
    const sorted = [...trades].sort((a,b) => b.pnlPct - a.pnlPct)

    return res.status(200).json({
      status: 'success',
      symbol, strategy, market, period,
      dataPoints: candles.length,
      stats: {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate,
        avgWin,
        avgLoss,
        totalPnlPct: totalPnl,
        expectancy,
        maxDrawdownPct: parseFloat(maxDD.toFixed(2)),
        finalEquity: parseFloat(equity.toFixed(2)),
        profitFactor: avgLoss !== 0 ? parseFloat((Math.abs(avgWin) / Math.abs(avgLoss)).toFixed(2)) : null,
      },
      bestTrade:  sorted[0] || null,
      worstTrade: sorted[sorted.length-1] || null,
      recentTrades: trades.slice(-10).reverse(),
      equityCurve: equityCurve.slice(-60),  // last 60 data points
    })

  } catch(err) {
    console.error('Backtest error:', err)
    return res.status(500).json({ error: err.message })
  }
}
