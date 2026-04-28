// /api/options-chain
// Fetches NIFTY/BANKNIFTY options chain
// Primary: NSE India (works when cookies are valid)
// Fallback: Zerodha Kite (when user is logged in)

export default async function handler(req, res) {
  const { symbol = 'NIFTY' } = req.query
  const kiteToken = req.headers['x-kite-access-token']

  try {
    const nseSymbol = symbol === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY'

    // Try NSE with proper session headers
    try {
      // First get a session cookie
      const sessionR = await fetch('https://www.nseindia.com/option-chain', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        }
      })
      const cookies = sessionR.headers.get('set-cookie') || ''

      // Now fetch options data with the session cookie
      const r = await fetch(
        `https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-IN,en;q=0.9',
            'Referer': 'https://www.nseindia.com/option-chain',
            'Cookie': cookies,
          }
        }
      )

      if (!r.ok) throw new Error(`NSE returned ${r.status}`)
      const data = await r.json()

      const records = data?.records?.data || []
      const spotPrice = data?.records?.underlyingValue || 0
      const expiries  = data?.records?.expiryDates || []
      const nearestExpiry = expiries[0]

      if (!records.length || !spotPrice) throw new Error('No data from NSE')

      // Filter for nearest expiry + strikes within ±6% of spot
      const filtered = records
        .filter(r => r.expiryDate === nearestExpiry)
        .filter(r => Math.abs(r.strikePrice - spotPrice) <= spotPrice * 0.06)
        .sort((a, b) => a.strikePrice - b.strikePrice)

      const chain = filtered.map(r => ({
        strike: r.strikePrice,
        isATM: Math.abs(r.strikePrice - spotPrice) < spotPrice * 0.005,
        call: r.CE ? {
          oi: r.CE.openInterest || 0, oiChange: r.CE.changeinOpenInterest || 0,
          ltp: r.CE.lastPrice || 0, iv: r.CE.impliedVolatility || 0,
          volume: r.CE.totalTradedVolume || 0, bid: r.CE.bidprice || 0, ask: r.CE.askPrice || 0,
        } : null,
        put: r.PE ? {
          oi: r.PE.openInterest || 0, oiChange: r.PE.changeinOpenInterest || 0,
          ltp: r.PE.lastPrice || 0, iv: r.PE.impliedVolatility || 0,
          volume: r.PE.totalTradedVolume || 0, bid: r.PE.bidprice || 0, ask: r.PE.askPrice || 0,
        } : null,
      }))

      const totalCallOI = chain.reduce((a, c) => a + (c.call?.oi || 0), 0)
      const totalPutOI  = chain.reduce((a, c) => a + (c.put?.oi  || 0), 0)
      const pcr = totalCallOI > 0 ? parseFloat((totalPutOI/totalCallOI).toFixed(2)) : 0
      const pcrSentiment = pcr > 1.3 ? 'Bullish' : pcr < 0.7 ? 'Bearish' : 'Neutral'
      let maxPain = 0, maxPainOI = 0
      chain.forEach(s => {
        const oi = (s.call?.oi||0) + (s.put?.oi||0)
        if (oi > maxPainOI) { maxPainOI=oi; maxPain=s.strike }
      })

      return res.status(200).json({
        status: 'success', symbol: nseSymbol, spotPrice,
        expiry: nearestExpiry, expiries: expiries.slice(0,4),
        pcr, pcrSentiment, maxPain, chain, source: 'NSE',
      })
    } catch(nseErr) {
      console.error('NSE options error:', nseErr.message)
      
      // If Kite is connected, use their quote for spot price at least
      if (kiteToken) {
        try {
          const kiteR = await fetch(`/api/kite-pro?action=quote&instruments=NSE:${nseSymbol === 'BANKNIFTY' ? 'NIFTY BANK' : 'NIFTY 50'}`,
            { headers: { 'x-kite-access-token': kiteToken } })
          const kiteD = await kiteR.json()
          const spotPrice = kiteD?.data?.['NSE:NIFTY 50']?.last_price || 0
          return res.status(200).json({
            status: 'partial', symbol: nseSymbol, spotPrice,
            expiries: [], chain: [],
            message: 'Options chain requires NSE session. Login during market hours for live data.',
            source: 'kite-partial',
          })
        } catch {}
      }
      
      // Return a graceful partial response
      return res.status(200).json({
        status: 'unavailable',
        symbol: nseSymbol,
        spotPrice: 0, expiries: [], chain: [],
        message: 'NSE options data unavailable outside market hours or due to API restrictions. Available 9:15 AM - 3:30 PM IST.',
        source: 'none',
      })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
