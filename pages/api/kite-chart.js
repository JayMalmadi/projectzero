// pages/api/kite-chart.js
// Fetches real OHLCV candlestick data from Kite Historical API
// Requires paid Kite Connect plan (which you have!)

// Instrument tokens for NSE symbols (needed by Kite API)
const TOKENS = {
  NIFTY:     '256265',
  BANKNIFTY: '260105',
  SENSEX:    '265',
  TCS:       '2953217',
  INFY:      '408065',
  ICICIBANK: '1270529',
  RELIANCE:  '738561',
  HDFCBANK:  '341249',
  SBIN:      '779521',
  WIPRO:     '969473',
  AXISBANK:  '1510401',
  BAJFINANCE:'4267265',
  MARUTI:    '2815745',
  LT:        '2939649',
  HDFC:      '340481',
}

export default async function handler(req, res) {
  const { symbol = 'NIFTY', interval = '15minute', days = 5 } = req.query
  const accessToken = req.headers['x-kite-access-token']
  const apiKey      = process.env.KITE_API_KEY

  if (!accessToken || !apiKey) {
    // Fallback to Yahoo Finance if not connected
    return fetchYahooFallback(symbol, res)
  }

  const token = TOKENS[symbol]
  if (!token) {
    return res.status(404).json({ error: `Unknown symbol: ${symbol}` })
  }

  try {
    // Calculate date range
    const to   = new Date()
    const from = new Date()
    from.setDate(from.getDate() - parseInt(days))

    // For intraday intervals, Kite only allows ~60 days back
    const fromStr = from.toISOString().split('T')[0] + ' 09:15:00'
    const toStr   = to.toISOString().split('T')[0]   + ' 15:30:00'

    const url = `https://api.kite.trade/instruments/historical/${token}/${interval}?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&continuous=0&oi=0`

    const r = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      }
    })

    const data = await r.json()

    if (data.status !== 'success') {
      console.error('Kite historical error:', data)
      return fetchYahooFallback(symbol, res)
    }

    // Convert Kite format [timestamp, open, high, low, close, volume]
    // to lightweight-charts format { time, open, high, low, close }
    const candles = (data.data?.candles || []).map(c => ({
      time:   Math.floor(new Date(c[0]).getTime() / 1000),
      open:   parseFloat(c[1]),
      high:   parseFloat(c[2]),
      low:    parseFloat(c[3]),
      close:  parseFloat(c[4]),
      volume: parseInt(c[5]),
    })).filter(c => c.open && c.close)

    return res.status(200).json({
      status:   'success',
      source:   'kite',
      symbol,
      interval,
      candles,
      last:     candles[candles.length - 1],
    })

  } catch (err) {
    console.error('Kite chart error:', err)
    return fetchYahooFallback(symbol, res)
  }
}

// Fallback: Yahoo Finance daily candles (no auth needed)
async function fetchYahooFallback(symbol, res) {
  try {
    const yahooMap = {
      NIFTY:'%5ENSEI', BANKNIFTY:'%5ENSEBANK', SENSEX:'%5EBSESN',
      TCS:'TCS.NS', INFY:'INFY.NS', ICICIBANK:'ICICIBANK.NS',
      RELIANCE:'RELIANCE.NS', HDFCBANK:'HDFCBANK.NS', SBIN:'SBIN.NS',
      WIPRO:'WIPRO.NS',
    }
    const yticker = yahooMap[symbol] || `${symbol}.NS`
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yticker}?interval=1d&range=3mo`
    )
    const data = await r.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error('No Yahoo data')

    const ts   = result.timestamp
    const q    = result.indicators.quote[0]
    const candles = ts.map((t, i) => ({
      time:   t,
      open:   parseFloat(q.open[i]?.toFixed(2)),
      high:   parseFloat(q.high[i]?.toFixed(2)),
      low:    parseFloat(q.low[i]?.toFixed(2)),
      close:  parseFloat(q.close[i]?.toFixed(2)),
      volume: q.volume[i] || 0,
    })).filter(c => c.open && c.close && !isNaN(c.close))

    return res.status(200).json({
      status:  'success',
      source:  'yahoo',
      symbol,
      interval: '1d',
      candles,
      last:    candles[candles.length - 1],
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
