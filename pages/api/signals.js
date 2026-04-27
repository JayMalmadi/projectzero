// pages/api/signals.js
// Fetches historical data and runs strategies to generate signals

export default async function handler(req, res) {
  const { symbol = 'NIFTY', strategy = 'ema' } = req.query

  try {
    // Fetch 6 months of daily data from Yahoo Finance
    const yahooMap = {
      'NIFTY':     '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'RELIANCE':  'RELIANCE.NS',
      'TCS':       'TCS.NS',
      'BTC':       'BTC-USD',
    }
    const ticker = yahooMap[symbol] || `${symbol}.NS`
    const r    = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`
    )
    const raw  = await r.json()
    const result = raw?.chart?.result?.[0]
    if (!result) return res.status(404).json({ error: 'No data' })

    const timestamps = result.timestamp
    const ohlcv      = result.indicators.quote[0]
    const closes     = ohlcv.close
    const highs      = ohlcv.high
    const lows       = ohlcv.low

    // Calculate indicators
    const ema9  = calcEMA(closes, 9)
    const ema21 = calcEMA(closes, 21)
    const rsi   = calcRSI(closes, 14)
    const atr   = calcATR(highs, lows, closes, 14)

    // Generate signal
    const last     = closes.length - 1
    const price    = closes[last]
    const prevFast = ema9[last-1], currFast = ema9[last]
    const prevSlow = ema21[last-1], currSlow = ema21[last]

    let signal = 'HOLD', reason = '', confidence = 0

    if (strategy === 'ema') {
      if (prevFast <= prevSlow && currFast > currSlow) {
        signal = 'BUY'; reason = `EMA9 (${currFast?.toFixed(0)}) crossed above EMA21 (${currSlow?.toFixed(0)})`
        confidence = 72
      } else if (prevFast >= prevSlow && currFast < currSlow) {
        signal = 'SELL'; reason = `EMA9 (${currFast?.toFixed(0)}) crossed below EMA21 (${currSlow?.toFixed(0)})`
        confidence = 68
      } else {
        reason = currFast > currSlow ? `Bullish trend — EMA9 above EMA21` : `Bearish trend — EMA9 below EMA21`
        confidence = 55
      }
    } else if (strategy === 'rsi') {
      const r14 = rsi[last]
      if (r14 < 35) {
        signal = 'BUY'; reason = `RSI oversold at ${r14?.toFixed(1)}`; confidence = 70
      } else if (r14 > 65) {
        signal = 'SELL'; reason = `RSI overbought at ${r14?.toFixed(1)}`; confidence = 68
      } else {
        reason = `RSI neutral at ${r14?.toFixed(1)}`; confidence = 50
      }
    }

    const stopLoss = signal === 'BUY'
      ? price - 1.5 * (atr[last] || price * 0.01)
      : signal === 'SELL'
        ? price + 1.5 * (atr[last] || price * 0.01)
        : null

    const target = signal === 'BUY'
      ? price + 3 * (atr[last] || price * 0.01)
      : signal === 'SELL'
        ? price - 3 * (atr[last] || price * 0.01)
        : null

    // Last 30 days chart data
    const chartData = timestamps.slice(-30).map((ts, i) => ({
      date:  new Date(ts * 1000).toLocaleDateString('en-IN', {day:'2-digit',month:'short'}),
      close: parseFloat(closes[closes.length-30+i]?.toFixed(2)),
      ema9:  parseFloat(ema9[ema9.length-30+i]?.toFixed(2)),
      ema21: parseFloat(ema21[ema21.length-30+i]?.toFixed(2)),
    }))

    return res.status(200).json({
      symbol, strategy, signal, reason, confidence,
      price:    parseFloat(price?.toFixed(2)),
      stopLoss: parseFloat(stopLoss?.toFixed(2)),
      target:   parseFloat(target?.toFixed(2)),
      rsi:      parseFloat(rsi[last]?.toFixed(1)),
      ema9:     parseFloat(ema9[last]?.toFixed(2)),
      ema21:    parseFloat(ema21[last]?.toFixed(2)),
      atr:      parseFloat(atr[last]?.toFixed(2)),
      chartData,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function calcEMA(data, period) {
  const k = 2 / (period + 1)
  const ema = []
  let prev = null
  for (const val of data) {
    if (val == null) { ema.push(null); continue }
    prev = prev == null ? val : val * k + prev * (1 - k)
    ema.push(prev)
  }
  return ema
}

function calcRSI(data, period) {
  const rsi = new Array(period).fill(null)
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = (data[i] || 0) - (data[i-1] || 0)
    if (d > 0) avgGain += d; else avgLoss += Math.abs(d)
  }
  avgGain /= period; avgLoss /= period
  for (let i = period; i < data.length; i++) {
    const d = (data[i] || 0) - (data[i-1] || 0)
    avgGain = (avgGain * (period-1) + (d > 0 ? d : 0)) / period
    avgLoss = (avgLoss * (period-1) + (d < 0 ? Math.abs(d) : 0)) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    rsi.push(100 - 100 / (1 + rs))
  }
  return rsi
}

function calcATR(highs, lows, closes, period) {
  const tr  = [0]
  const atr = new Array(period).fill(null)
  for (let i = 1; i < highs.length; i++) {
    tr.push(Math.max(
      (highs[i]||0) - (lows[i]||0),
      Math.abs((highs[i]||0) - (closes[i-1]||0)),
      Math.abs((lows[i]||0)  - (closes[i-1]||0))
    ))
  }
  let sum = tr.slice(1, period+1).reduce((a,b) => a+b, 0) / period
  atr[period] = sum
  for (let i = period+1; i < tr.length; i++) {
    sum = (sum * (period-1) + tr[i]) / period
    atr.push(sum)
  }
  return atr
}
