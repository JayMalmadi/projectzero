// /api/options-chain
// Live options chain for NIFTY, BANKNIFTY, FINNIFTY
// NFO instruments cached in Supabase — fetched once per day at startup
// Live quotes refresh every 2 seconds — near real-time OI and LTP

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE = 'https://api.kite.trade'
const API_KEY   = process.env.KITE_API_KEY

// Spot price instrument map
const SPOT_MAP = {
  NIFTY:     'NSE:NIFTY 50',
  BANKNIFTY: 'NSE:NIFTY BANK',
  FINNIFTY:  'NSE:NIFTY FIN SERVICE',
}

// Strike step per index
const STEP = {
  NIFTY:     50,
  BANKNIFTY: 100,
  FINNIFTY:  50,
}

async function getAccessToken() {
  try {
    const { data } = await sb.from('kite_session').select('access_token,expires_at').eq('id','current').single()
    if (!data) return null
    if (new Date() > new Date(data.expires_at)) return null
    return data.access_token
  } catch { return null }
}

// Cache NFO instruments in Supabase — call once per day
// Returns instrument token map: { 'NIFTY_2026-05-15_24000_CE': 'NFO:NIFTY2615MAY24000CE', ... }
async function getCachedInstruments(symbol, accessToken) {
  const today = new Date().toISOString().split('T')[0]

  // Check cache first
  try {
    const { data } = await sb
      .from('nfo_instruments_cache')
      .select('instruments_json, cached_date')
      .eq('symbol', symbol)
      .single()

    if (data && data.cached_date === today) {
      console.log(`[OptionsChain] Using cached instruments for ${symbol}`)
      return JSON.parse(data.instruments_json)
    }
  } catch { /* cache miss — fetch fresh */ }

  console.log(`[OptionsChain] Fetching fresh NFO instruments for ${symbol}`)

  // Fetch the 5MB instruments file
  const instrR    = await fetch(`${KITE_BASE}/instruments/NFO`, {
    headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${accessToken}` }
  })
  const instrText = await instrR.text()
  const allLines  = instrText.split('\n')
  const header    = allLines[0] || ''
  const dataLines = allLines.slice(1)

  // Detect column positions
  const hCols = header.split(',')
  let ci = {
    token:  hCols.indexOf('instrument_token'),
    sym:    hCols.indexOf('tradingsymbol'),
    name:   hCols.indexOf('name'),
    expiry: hCols.indexOf('expiry'),
    strike: hCols.indexOf('strike'),
    lot:    hCols.indexOf('lot_size'),
    type:   hCols.indexOf('instrument_type'),
  }
  if (ci.token < 0) { ci = { token:0, sym:2, name:3, expiry:5, strike:6, lot:8, type:9 } }

  // Parse only this symbol's instruments
  const instruments = []
  const today2 = new Date().toISOString().split('T')[0]

  for (const line of dataLines) {
    if (!line.trim()) continue
    const cols  = line.split(',')
    if (cols.length < 8) continue
    const iName = (cols[ci.name] || '').trim()
    const iType = (cols[ci.type] || '').trim()
    if (iName !== symbol) continue
    if (iType !== 'CE' && iType !== 'PE') continue
    const expiry = (cols[ci.expiry] || '').trim()
    if (expiry < today2) continue  // skip past expiries
    instruments.push({
      token:   cols[ci.token],
      symbol:  cols[ci.sym],
      expiry,
      strike:  parseFloat(cols[ci.strike]),
      lotSize: parseInt(cols[ci.lot]) || 25,
      type:    iType,
    })
  }

  // Save to Supabase cache
  try {
    await sb.from('nfo_instruments_cache').upsert({
      symbol,
      cached_date:      today,
      instruments_json: JSON.stringify(instruments),
      count:            instruments.length,
    }, { onConflict: 'symbol' })
    console.log(`[OptionsChain] Cached ${instruments.length} instruments for ${symbol}`)
  } catch(e) {
    console.warn('[OptionsChain] Cache save failed:', e.message)
  }

  return instruments
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  const { symbol = 'NIFTY', expiry: reqExpiry } = req.query
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return res.status(200).json({
      status: 'no_session', action: 'login_required', symbol,
      message: 'Login with Zerodha to see live options chain.',
      chain: [], expiries: [], spotPrice: 0,
    })
  }

  const AUTH = `token ${API_KEY}:${accessToken}`
  const HDRS = { 'X-Kite-Version': '3', 'Authorization': AUTH }

  try {
    // Step 1: Spot price + instruments in parallel
    const spotInstr = SPOT_MAP[symbol] || 'NSE:NIFTY 50'
    const [spotRes, instruments] = await Promise.all([
      fetch(`${KITE_BASE}/quote?i=${encodeURIComponent(spotInstr)}`, { headers: HDRS }).then(r => r.json()),
      getCachedInstruments(symbol, accessToken),
    ])

    const spotPrice = spotRes.data?.[spotInstr]?.last_price || 0
    if (!spotPrice) {
      return res.status(200).json({
        status: 'no_data', symbol, spotPrice: 0, chain: [], expiries: [],
        message: 'Could not fetch spot price. Market may be closed.',
      })
    }

    if (!instruments.length) {
      return res.status(200).json({
        status: 'no_instruments', symbol, spotPrice, chain: [], expiries: [],
        message: `No ${symbol} options instruments in cache. Try refreshing.`,
      })
    }

    // Step 2: Expiries — upcoming only
    const today    = new Date().toISOString().split('T')[0]
    const expiries = [...new Set(instruments.map(i => i.expiry))].filter(e => e >= today).sort()
    const useExpiry = (reqExpiry && expiries.includes(reqExpiry)) ? reqExpiry : expiries[0]

    if (!useExpiry) {
      return res.status(200).json({
        status: 'no_expiry', symbol, spotPrice, chain: [], expiries: [],
        message: 'No upcoming expiries. Market closed for the week.',
      })
    }

    // Step 3: ATM ± 10 strikes
    const step = STEP[symbol] || 50
    const atm  = Math.round(spotPrice / step) * step
    const strikesWanted = Array.from({ length: 21 }, (_, i) => atm + (i - 10) * step)
    const filtered = instruments.filter(i =>
      i.expiry === useExpiry && strikesWanted.includes(i.strike)
    )

    if (!filtered.length) {
      return res.status(200).json({
        status: 'no_strikes', symbol, spotPrice, atm,
        expiries: expiries.slice(0, 6), chain: [],
        message: `No ${symbol} strikes for expiry ${useExpiry}.`,
      })
    }

    // Step 4: Live quotes — single Kite call for all 42 instruments
    const tokens    = filtered.map(i => `NFO:${i.symbol}`)
    const allQuotes = {}
    // Kite supports up to 500 instruments per quote call
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk  = tokens.slice(i, i + 500)
      const params = chunk.map(t => `i=${encodeURIComponent(t)}`).join('&')
      const qR     = await fetch(`${KITE_BASE}/quote?${params}`, { headers: HDRS })
      const qD     = await qR.json()
      Object.assign(allQuotes, qD.data || {})
    }

    // Step 5: Build chain
    const chainMap = {}
    for (const instr of filtered) {
      if (!chainMap[instr.strike]) {
        chainMap[instr.strike] = { strike: instr.strike, isATM: instr.strike === atm }
      }
      const quote = allQuotes[`NFO:${instr.symbol}`] || {}
      const oiChg = quote.oi && quote.oi_day_low ? quote.oi - quote.oi_day_low : 0
      const side  = instr.type === 'CE' ? 'call' : 'put'
      chainMap[instr.strike][side] = {
        symbol:   instr.symbol,
        lotSize:  instr.lotSize,
        ltp:      quote.last_price   || 0,
        bid:      quote.depth?.buy?.[0]?.price  || 0,
        ask:      quote.depth?.sell?.[0]?.price || 0,
        oi:       quote.oi           || 0,
        oiChange: oiChg,
        volume:   quote.volume       || 0,
        high:     quote.ohlc?.high   || 0,
        low:      quote.ohlc?.low    || 0,
        iv:       0,  // Kite doesn't provide IV — can calculate later
      }
    }

    const chain = Object.values(chainMap).sort((a, b) => a.strike - b.strike)

    // Step 6: PCR + Max Pain
    const totalCallOI = chain.reduce((a, s) => a + (s.call?.oi || 0), 0)
    const totalPutOI  = chain.reduce((a, s) => a + (s.put?.oi  || 0), 0)
    const pcr = totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(2)) : 0

    let maxPain = atm, minLoss = Infinity
    for (const s of chain) {
      let loss = 0
      for (const o of chain) {
        if (o.strike < s.strike) loss += (s.strike - o.strike) * (o.call?.oi || 0)
        if (o.strike > s.strike) loss += (o.strike - s.strike) * (o.put?.oi  || 0)
      }
      if (loss < minLoss) { minLoss = loss; maxPain = s.strike }
    }

    // Market hours
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const mins = now.getHours() * 60 + now.getMinutes()
    const isMarketOpen = now.getDay() >= 1 && now.getDay() <= 5 && mins >= 555 && mins <= 930

    return res.status(200).json({
      status: 'success', symbol, spotPrice, atm,
      expiry:  useExpiry,
      expiries: expiries.slice(0, 6),
      pcr,
      pcrSentiment: pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral',
      maxPain, chain, totalCallOI, totalPutOI,
      lotSize: filtered[0]?.lotSize || 25,
      isMarketOpen,
      source:  'kite',
      fetchedAt: Date.now(),
    })

  } catch(err) {
    console.error('[OptionsChain] Error:', err)
    return res.status(500).json({ error: err.message, symbol })
  }
}
