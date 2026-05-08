// /api/options-chain
// Real options chain from Zerodha Kite API

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE = 'https://api.kite.trade'
const API_KEY   = process.env.KITE_API_KEY

async function getAccessToken() {
  try {
    const { data } = await sb.from('kite_session').select('access_token,expires_at').eq('id','current').single()
    if (!data) return null
    if (new Date() > new Date(data.expires_at)) return null
    return data.access_token
  } catch { return null }
}

export default async function handler(req, res) {
  const { symbol = 'NIFTY', expiry: reqExpiry } = req.query
  const accessToken = await getAccessToken()

  if (!accessToken) {
    return res.status(200).json({
      status: 'no_session', action: 'login_required', symbol,
      message: 'Zerodha session expired. Please login to see live options chain.',
      chain: [], expiries: [], spotPrice: 0
    })
  }

  const AUTH = `token ${API_KEY}:${accessToken}`
  const HDRS = { 'X-Kite-Version': '3', 'Authorization': AUTH }

  try {
    // Step 1: Spot price
    const spotMap = {
      NIFTY: 'NSE:NIFTY 50', BANKNIFTY: 'NSE:NIFTY BANK',
      FINNIFTY: 'NSE:NIFTY FIN SERVICE', MIDCPNIFTY: 'NSE:NIFTY MID SELECT',
    }
    const spotInstr = spotMap[symbol] || 'NSE:NIFTY 50'
    const spotR = await fetch(`${KITE_BASE}/quote?i=${encodeURIComponent(spotInstr)}`, { headers: HDRS })
    const spotD = await spotR.json()
    const spotPrice = spotD.data?.[spotInstr]?.last_price || 0
    if (!spotPrice) return res.status(200).json({
      status: 'no_data', symbol, spotPrice: 0, chain: [], expiries: [],
      message: 'Could not fetch spot price. Market may be closed.'
    })

    // Step 2: NFO Instruments CSV
    const instrR    = await fetch(`${KITE_BASE}/instruments/NFO`, { headers: HDRS })
    const instrText = await instrR.text()
    const allLines  = instrText.split('\n')
    const header    = allLines[0] || ''
    const dataLines = allLines.slice(1)
    console.log('[OptionsChain] NFO lines:', allLines.length, 'Header:', header.substring(0, 100))

    // Detect columns dynamically from header
    const hCols = header.split(',')
    let ci = {
      token: hCols.indexOf('instrument_token'), sym: hCols.indexOf('tradingsymbol'),
      name: hCols.indexOf('name'), expiry: hCols.indexOf('expiry'),
      strike: hCols.indexOf('strike'), lot: hCols.indexOf('lot_size'),
      type: hCols.indexOf('instrument_type'),
    }
    if (ci.token < 0) { ci = { token:0, sym:2, name:3, expiry:5, strike:6, lot:8, type:9 } }
    console.log('[OptionsChain] Cols:', JSON.stringify(ci))

    const instruments = []
    for (const line of dataLines) {
      if (!line.trim()) continue
      const cols = line.split(',')
      if (cols.length < 8) continue
      const iName = (cols[ci.name] || '').trim()
      const iType = (cols[ci.type] || '').trim()
      if (iName !== symbol) continue
      if (iType !== 'CE' && iType !== 'PE') continue
      instruments.push({
        token: cols[ci.token], symbol: cols[ci.sym],
        expiry: (cols[ci.expiry] || '').trim(),
        strike: parseFloat(cols[ci.strike]),
        lotSize: parseInt(cols[ci.lot]) || 25, type: iType,
      })
    }
    console.log('[OptionsChain]', symbol, 'instruments:', instruments.length)

    if (instruments.length === 0) return res.status(200).json({
      status: 'no_instruments', symbol, spotPrice, chain: [], expiries: [],
      message: `No ${symbol} options found in Kite NFO.`,
      debug: { headerPreview: header.substring(0, 200), totalLines: allLines.length }
    })

    // Step 3: Find nearest upcoming expiry
    const today    = new Date().toISOString().split('T')[0]
    const expiries = [...new Set(instruments.map(i => i.expiry))].filter(e => e >= today).sort()
    const useExpiry = (reqExpiry && expiries.includes(reqExpiry)) ? reqExpiry : expiries[0]
    console.log('[OptionsChain] Expiries:', expiries.slice(0,5), '| Using:', useExpiry)

    if (!useExpiry) return res.status(200).json({
      status: 'no_expiry', symbol, spotPrice, chain: [], expiries: [],
      message: 'No upcoming expiries found.'
    })

    // Step 4: ATM ± 10 strikes
    const step = symbol === 'BANKNIFTY' ? 100 : symbol === 'MIDCPNIFTY' ? 25 : 50
    const atm  = Math.round(spotPrice / step) * step
    const strikesWanted = Array.from({length:21}, (_,i) => atm + (i-10)*step)
    const filtered = instruments.filter(i => i.expiry === useExpiry && strikesWanted.includes(i.strike))
    console.log('[OptionsChain] Filtered:', filtered.length, 'contracts | ATM:', atm)

    if (filtered.length === 0) return res.status(200).json({
      status: 'no_strikes', symbol, spotPrice, atm,
      expiries: expiries.slice(0, 6), chain: [],
      message: `No ${symbol} strikes for expiry ${useExpiry}. Available: ${expiries.slice(0,3).join(', ')}`
    })

    // Step 5: Live quotes
    const tokens = filtered.map(i => `NFO:${i.symbol}`)
    const allQuotes = {}
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i+100)
      const qR = await fetch(`${KITE_BASE}/quote?${chunk.map(t=>`i=${encodeURIComponent(t)}`).join('&')}`, { headers: HDRS })
      const qD = await qR.json()
      Object.assign(allQuotes, qD.data || {})
    }

    // Step 6: Build chain
    const chainMap = {}
    for (const instr of filtered) {
      if (!chainMap[instr.strike]) chainMap[instr.strike] = { strike: instr.strike, isATM: instr.strike === atm }
      const quote = allQuotes[`NFO:${instr.symbol}`] || {}
      chainMap[instr.strike][instr.type === 'CE' ? 'call' : 'put'] = {
        symbol: instr.symbol, lotSize: instr.lotSize,
        ltp: quote.last_price || 0,
        bid: quote.depth?.buy?.[0]?.price || 0, ask: quote.depth?.sell?.[0]?.price || 0,
        oi: quote.oi || 0,
        oiChange: quote.oi_day_high ? (quote.oi - (quote.oi_day_low || quote.oi)) : 0,
        volume: quote.volume || 0, high: quote.ohlc?.high || 0, low: quote.ohlc?.low || 0,
      }
    }
    const chain = Object.values(chainMap).sort((a,b) => a.strike - b.strike)

    // Step 7: PCR + Max Pain
    const totalCallOI = chain.reduce((a,s) => a + (s.call?.oi||0), 0)
    const totalPutOI  = chain.reduce((a,s) => a + (s.put?.oi||0), 0)
    const pcr = totalCallOI > 0 ? parseFloat((totalPutOI/totalCallOI).toFixed(2)) : 0
    let maxPain = atm, minLoss = Infinity
    for (const s of chain) {
      let loss = 0
      for (const o of chain) {
        if (o.strike < s.strike) loss += (s.strike - o.strike) * (o.call?.oi||0)
        if (o.strike > s.strike) loss += (o.strike - s.strike) * (o.put?.oi||0)
      }
      if (loss < minLoss) { minLoss = loss; maxPain = s.strike }
    }

    return res.status(200).json({
      status: 'success', symbol, spotPrice, atm,
      expiry: useExpiry, expiries: expiries.slice(0, 6),
      pcr, pcrSentiment: pcr > 1.2 ? 'Bullish' : pcr < 0.8 ? 'Bearish' : 'Neutral',
      maxPain, chain, totalCallOI, totalPutOI,
      lotSize: filtered[0]?.lotSize || 25, source: 'kite',
    })

  } catch(err) {
    console.error('[OptionsChain] Error:', err)
    return res.status(500).json({ error: err.message, symbol })
  }
}
