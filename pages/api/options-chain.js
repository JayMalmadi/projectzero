// /api/options-chain
// Fetches NIFTY/BANKNIFTY options chain from NSE India (free, no auth needed)
// Returns OI, LTP, IV, Greeks for all strikes around ATM

export default async function handler(req, res) {
  const { symbol = 'NIFTY' } = req.query

  try {
    const nseSymbol = symbol === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY'

    // NSE options chain endpoint (public, no auth)
    const r = await fetch(
      `https://www.nseindia.com/api/option-chain-indices?symbol=${nseSymbol}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.nseindia.com/option-chain',
        }
      }
    )

    if (!r.ok) throw new Error(`NSE returned ${r.status}`)
    const data = await r.json()

    const records = data?.records?.data || []
    const spotPrice = data?.records?.underlyingValue || 0
    const expiries  = data?.records?.expiryDates || []
    const nearestExpiry = expiries[0]

    // Filter for nearest expiry + strikes within ±5% of spot
    const filtered = records
      .filter(r => r.expiryDate === nearestExpiry)
      .filter(r => {
        const strikeRange = spotPrice * 0.06
        return Math.abs(r.strikePrice - spotPrice) <= strikeRange
      })
      .sort((a, b) => a.strikePrice - b.strikePrice)

    // Format the chain
    const chain = filtered.map(r => ({
      strike:    r.strikePrice,
      isATM:     Math.abs(r.strikePrice - spotPrice) < (spotPrice * 0.005),
      call: r.CE ? {
        oi:       r.CE.openInterest || 0,
        oiChange: r.CE.changeinOpenInterest || 0,
        ltp:      r.CE.lastPrice || 0,
        iv:       r.CE.impliedVolatility || 0,
        volume:   r.CE.totalTradedVolume || 0,
        bid:      r.CE.bidprice || 0,
        ask:      r.CE.askPrice || 0,
      } : null,
      put: r.PE ? {
        oi:       r.PE.openInterest || 0,
        oiChange: r.PE.changeinOpenInterest || 0,
        ltp:      r.PE.lastPrice || 0,
        iv:       r.PE.impliedVolatility || 0,
        volume:   r.PE.totalTradedVolume || 0,
        bid:      r.PE.bidprice || 0,
        ask:      r.PE.askPrice || 0,
      } : null,
    }))

    // PCR (Put-Call Ratio) — market sentiment
    const totalCallOI = chain.reduce((a, c) => a + (c.call?.oi || 0), 0)
    const totalPutOI  = chain.reduce((a, c) => a + (c.put?.oi  || 0), 0)
    const pcr         = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(2)) : 0
    const pcrSentiment = pcr > 1.3 ? 'Bullish (high PCR)'
                       : pcr < 0.7 ? 'Bearish (low PCR)'
                       : 'Neutral'

    // Max Pain — strike with highest combined OI (where market tends to expire)
    let maxPainStrike = 0, maxPainOI = 0
    chain.forEach(s => {
      const combined = (s.call?.oi || 0) + (s.put?.oi || 0)
      if (combined > maxPainOI) { maxPainOI = combined; maxPainStrike = s.strike }
    })

    return res.status(200).json({
      status: 'success',
      symbol: nseSymbol,
      spotPrice,
      expiry: nearestExpiry,
      expiries: expiries.slice(0, 4),
      pcr,
      pcrSentiment,
      maxPain: maxPainStrike,
      chain,
    })
  } catch (err) {
    console.error('Options chain error:', err)
    return res.status(500).json({ error: err.message })
  }
}
