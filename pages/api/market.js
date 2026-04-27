// pages/api/market.js
// Fetches live market data - uses Kite session if available, else Yahoo Finance

export default async function handler(req, res) {
  const { symbols = 'NIFTY,BANKNIFTY,SENSEX' } = req.query
  const enctoken = req.headers['x-kite-token']

  const symbolList = symbols.split(',')
  const results = {}

  // If Kite session available, use it
  if (enctoken) {
    try {
      const kiteSymbols = symbolList.map(s => {
        const map = {
          'NIFTY':    'NSE:NIFTY 50',
          'BANKNIFTY':'NSE:NIFTY BANK',
          'SENSEX':   'BSE:SENSEX',
        }
        return map[s] || `NSE:${s}`
      })

      const r = await fetch(
        `https://kite.zerodha.com/oms/quote?${kiteSymbols.map(s=>`i=${encodeURIComponent(s)}`).join('&')}`,
        { headers: { 'Authorization': `enctoken ${enctoken}`, 'X-Kite-Version': '3' } }
      )
      const data = await r.json()
      if (data.data) {
        for (const [key, val] of Object.entries(data.data)) {
          const sym = key.split(':')[1].replace(' ','')
          results[sym] = {
            price:  val.last_price,
            change: val.net_change,
            pct:    val.change,
            high:   val.ohlc?.high,
            low:    val.ohlc?.low,
            volume: val.volume,
          }
        }
        return res.status(200).json({ source: 'kite', data: results })
      }
    } catch {}
  }

  // Fallback: Yahoo Finance
  try {
    const yahooMap = {
      'NIFTY':     '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'SENSEX':    '^BSESN',
      'BTC':       'BTC-USD',
      'ETH':       'ETH-USD',
    }

    const fetches = symbolList.map(async (sym) => {
      const yticker = yahooMap[sym] || `${sym}.NS`
      try {
        const r    = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${yticker}?interval=1d&range=2d`
        )
        const data = await r.json()
        const meta = data?.chart?.result?.[0]?.meta
        if (meta) {
          const prev  = meta.chartPreviousClose || meta.previousClose
          const price = meta.regularMarketPrice
          results[sym] = {
            price,
            change: parseFloat((price - prev).toFixed(2)),
            pct:    parseFloat(((price - prev) / prev * 100).toFixed(2)),
            high:   meta.regularMarketDayHigh,
            low:    meta.regularMarketDayLow,
            volume: meta.regularMarketVolume,
          }
        }
      } catch {}
    })

    await Promise.all(fetches)
    return res.status(200).json({ source: 'yahoo', data: results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
