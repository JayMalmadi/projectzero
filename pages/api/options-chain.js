// /api/options-chain
// Real options chain from Zerodha Kite API
// Falls back to NSE if Kite not connected

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE = 'https://api.kite.trade'
const API_KEY   = process.env.KITE_API_KEY

// Get stored access token from Supabase (set when user logs in)
async function getAccessToken(headerToken) {
  if (headerToken) return headerToken
  try {
    const { data } = await sb.from('kite_session').select('access_token,expires_at').eq('id','current').single()
    if (!data) return null
    if (new Date() > new Date(data.expires_at)) return null
    return data.access_token
  } catch { return null }
}

// Get all instruments for a segment (cached)
// (unused helper — instruments fetched inline with correct auth)

// Get nearest weekly expiry Thursday
function getNearestExpiry() {
  const now  = new Date()
  const day  = now.getDay() // 0=Sun, 4=Thu
  const diff = day <= 4 ? 4 - day : 7 - day + 4
  const expiry = new Date(now)
  expiry.setDate(now.getDate() + (diff === 0 && now.getHours() >= 15 ? 7 : diff))
  return expiry.toISOString().split('T')[0] // YYYY-MM-DD
}

export default async function handler(req, res) {
  const { symbol = 'NIFTY' } = req.query
  const headerToken = req.headers['x-kite-access-token']
  const accessToken = await getAccessToken(headerToken)

  if (!accessToken) {
    return res.status(200).json({
      status: 'no_session',
      symbol,
      message: 'Zerodha session expired or not logged in. Please login via the dashboard to see live options chain.',
      action: 'login_required',
      chain: [], expiries: [], spotPrice: 0
    })
  }

  const AUTH = `token ${API_KEY}:${accessToken}`
  const HDRS = { 'X-Kite-Version': '3', 'Authorization': AUTH }

  try {
    // Step 1: Get spot price
    const spotMap = {
      NIFTY:    'NSE:NIFTY 50',
      BANKNIFTY:'NSE:NIFTY BANK',
      FINNIFTY:  'NSE:NIFTY FIN SERVICE',
    }
    const spotInstr = spotMap[symbol] || 'NSE:NIFTY 50'
    const spotR = await fetch(`${KITE_BASE}/quote?i=${encodeURIComponent(spotInstr)}`, { headers: HDRS })
    const spotD = await spotR.json()
    const spotPrice = spotD.data?.[spotInstr]?.last_price || 0

    if (!spotPrice) {
      return res.status(200).json({ status: 'no_data', symbol, spotPrice: 0, chain: [], expiries: [] })
    }

    // Step 2: Get options instruments (NFO segment) — uses correct auth
    const instrR = await fetch(`${KITE_BASE}/instruments/NFO`, { headers: HDRS })
    const instrText = await instrR.text()
    const lines = instrText.split('\n').slice(1) // skip header

    // Parse CSV: instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange
    const instruments = []
    for (const line of lines) {
      if (!line.trim()) continue
      const cols = line.split(',')
      if (cols.length < 12) continue
      const name = cols[3]
      const type = cols[9] // CE or PE
      const seg  = cols[10]
      if (name !== symbol) continue
      if (type !== 'CE' && type !== 'PE') continue
      instruments.push({
        token:    cols[0],
        symbol:   cols[2],  // e.g. NIFTY24MAY24000CE
        expiry:   cols[5],  // YYYY-MM-DD
        strike:   parseFloat(cols[6]),
        lotSize:  parseInt(cols[8]),
        type:     type,     // CE or PE
      })
    }

    // Step 3: Find expiries
    const expiries = [...new Set(instruments.map(i => i.expiry))].sort()
    const nearestExpiry = expiries[0]

    // Step 4: Filter strikes near ATM (ATM ± 10 strikes, step 50 for NIFTY/100 for BN)
    const step = symbol === 'BANKNIFTY' ? 100 : symbol === 'FINNIFTY' ? 50 : 50
    const atm  = Math.round(spotPrice / step) * step
    const strikesWanted = []
    for (let i = -10; i <= 10; i++) strikesWanted.push(atm + i * step)

    const filtered = instruments.filter(i =>
      i.expiry === nearestExpiry && strikesWanted.includes(i.strike)
    )

    if (filtered.length === 0) {
      return res.status(200).json({
        status: 'no_strikes', symbol, spotPrice, expiries: expiries.slice(0,4), chain: [],
        message: 'No options found for this expiry. Market may be closed.'
      })
    }

    // Step 5: Get live quotes for all filtered options
    const tokens = filtered.map(i => `NFO:${i.symbol}`)
    const chunkSize = 100 // Kite max per request
    const allQuotes = {}

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize)
      const qUrl  = `${KITE_BASE}/quote?${chunk.map(t => `i=${encodeURIComponent(t)}`).join('&')}`
      const qR    = await fetch(qUrl, { headers: HDRS })
      const qD    = await qR.json()
      Object.assign(allQuotes, qD.data || {})
    }

    // Step 6: Build chain
    const chainMap = {}
    for (const instr of filtered) {
      const key    = instr.strike
      const qKey   = `NFO:${instr.symbol}`
      const quote  = allQuotes[qKey] || {}
      const oiData = quote.oi || 0
      const oiChg  = quote.oi_day_high && quote.oi_day_low ? quote.oi - quote.oi_day_low : 0

      if (!chainMap[key]) chainMap[key] = { strike: key, isATM: key === atm }

      const side = instr.type === 'CE' ? 'call' : 'put'
      chainMap[key][side] = {
        symbol:    instr.symbol,
        token:     instr.token,
        lotSize:   instr.lotSize,
        ltp:       quote.last_price || 0,
        bid:       quote.depth?.buy?.[0]?.price || 0,
        ask:       quote.depth?.sell?.[0]?.price || 0,
        oi:        oiData,
        oiChange:  oiChg,
        volume:    quote.volume || 0,
        iv:        0, // Kite doesn't provide IV directly
        high:      quote.ohlc?.high || 0,
        low:       quote.ohlc?.low || 0,
      }
    }

    const chain = Object.values(chainMap).sort((a,b) => a.strike - b.strike)

    // Step 7: Calculate PCR and Max Pain
    const totalCallOI = chain.reduce((a,s) => a + (s.call?.oi || 0), 0)
    const totalPutOI  = chain.reduce((a,s) => a + (s.put?.oi  || 0), 0)
    const pcr = totalCallOI > 0 ? parseFloat((totalPutOI/totalCallOI).toFixed(2)) : 0

    // Max pain = strike where total option seller loss is minimum
    let maxPain = atm, minLoss = Infinity
    for (const s of chain) {
      let totalLoss = 0
      for (const other of chain) {
        if (other.strike < s.strike) totalLoss += (s.strike - other.strike) * (other.call?.oi || 0)
        if (other.strike > s.strike) totalLoss += (other.strike - s.strike) * (other.put?.oi  || 0)
      }
      if (totalLoss < minLoss) { minLoss = totalLoss; maxPain = s.strike }
    }

    return res.status(200).json({
      status:     'success',
      symbol,
      spotPrice,
      atm,
      expiry:     nearestExpiry,
      expiries:   expiries.slice(0, 6),
      pcr,
      pcrSentiment: pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral',
      maxPain,
      chain,
      totalCallOI,
      totalPutOI,
      lotSize:    filtered[0]?.lotSize || 25,
      source:     'kite',
    })

  } catch(err) {
    console.error('Options chain error:', err)
    return res.status(500).json({ error: err.message, symbol })
  }
}
