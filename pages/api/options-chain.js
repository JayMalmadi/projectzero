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

  // Fetch the 5MB instruments file with 8s timeout (Vercel limit is 10s)
  const controller = new AbortController()
  const fetchTimeout = setTimeout(() => controller.abort(), 8000)
  let instrText = ''
  try {
    const instrR = await fetch(`${KITE_BASE}/instruments/NFO`, {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${accessToken}` },
      signal: controller.signal,
    })
    instrText = await instrR.text()
  } catch(fetchErr) {
    clearTimeout(fetchTimeout)
    console.warn('[OptionsChain] NFO fetch timeout/error:', fetchErr.message)
    return [] // triggers "loading" state in handler
  } finally {
    clearTimeout(fetchTimeout)
  }
  if (!instrText || instrText.length < 1000) return []
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
    const iName = (cols[ci.name] || '').trim().replace(/^"|"$/g, '')
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


// ── Black-Scholes Greeks ───────────────────────────────────────────
// Calculates IV, Delta, Gamma, Theta, Vega for each option
// Risk-free rate: 6.5% (India 10Y Gsec approximate)

const RISK_FREE = 0.065

function normCDF(x) {
  return (1 + Math.erf ? erf(x) : approxErf(x)) / 2
}
function erf(x) {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x)
  return sign * y
}
function approxErf(x) {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - (0.254829592*t - 0.284496736*t*t + 1.421413741*t*t*t - 1.453152027*t*t*t*t + 1.061405429*t*t*t*t*t) * Math.exp(-x*x)
  return sign * y
}
function nCDF(x) {
  // Standard normal CDF
  return (1 + erf(x / Math.sqrt(2))) / 2
}
function nPDF(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
}

function calcGreeks(S, K, T, sigma, optType) {
  // S=spot, K=strike, T=time(years), sigma=IV(decimal), optType=CE|PE
  if (T <= 0.0001 || sigma <= 0.001) {
    const intrinsic = optType === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0)
    return { price: intrinsic, delta: optType==='CE'?1:- 1, gamma:0, theta:0, vega:0 }
  }
  const r  = RISK_FREE
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  const eRT = Math.exp(-r * T)

  const price = optType === 'CE'
    ? S * nCDF(d1) - K * eRT * nCDF(d2)
    : K * eRT * nCDF(-d2) - S * nCDF(-d1)

  const delta = optType === 'CE' ? nCDF(d1) : nCDF(d1) - 1
  const gamma = nPDF(d1) / (S * sigma * Math.sqrt(T))
  const vega  = S * Math.sqrt(T) * nPDF(d1) * 0.01  // per 1% IV change
  const theta = optType === 'CE'
    ? (-(S * sigma * nPDF(d1)) / (2 * Math.sqrt(T)) - r * K * eRT * nCDF(d2))  / 365
    : (-(S * sigma * nPDF(d1)) / (2 * Math.sqrt(T)) + r * K * eRT * nCDF(-d2)) / 365

  return {
    price: parseFloat(price.toFixed(2)),
    delta: parseFloat(delta.toFixed(4)),
    gamma: parseFloat(gamma.toFixed(6)),
    theta: parseFloat(theta.toFixed(2)),
    vega:  parseFloat(vega.toFixed(2)),
  }
}

function calcIV(S, K, T, marketPrice, optType) {
  if (marketPrice <= 0.5 || T <= 0.0001) return 0
  let sigma = 0.3
  for (let i = 0; i < 100; i++) {
    const g = calcGreeks(S, K, T, sigma, optType)
    const diff = g.price - marketPrice
    if (Math.abs(diff) < 0.01) break
    const vega = g.vega / 0.01
    if (Math.abs(vega) < 1e-10) break
    sigma -= diff / vega
    if (sigma <= 0) sigma = 0.001
    if (sigma > 5)  sigma = 5
  }
  return parseFloat((sigma * 100).toFixed(2))
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
        status: 'loading', symbol, spotPrice, chain: [], expiries: [],
        message: `Loading ${symbol} options data... First load takes ~15 seconds. Tap Try Again.`,
        retryAfter: 15,
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
      const ltp   = quote.last_price || 0

      // Calculate IV and Greeks using Black-Scholes
      const expDate = new Date(instr.expiry + 'T15:30:00+05:30') // NSE expiry at 3:30 PM IST
      const now     = new Date()
      const T       = Math.max((expDate - now) / (1000 * 60 * 60 * 24 * 365), 0.0001)
      const iv      = ltp > 0.5 ? calcIV(spotPrice, instr.strike, T, ltp, instr.type) : 0
      const greeks  = iv > 0    ? calcGreeks(spotPrice, instr.strike, T, iv/100, instr.type) : null

      chainMap[instr.strike][side] = {
        symbol:   instr.symbol,
        lotSize:  instr.lotSize,
        ltp,
        bid:      quote.depth?.buy?.[0]?.price  || 0,
        ask:      quote.depth?.sell?.[0]?.price || 0,
        oi:       quote.oi           || 0,
        oiChange: oiChg,
        volume:   quote.volume       || 0,
        high:     quote.ohlc?.high   || 0,
        low:      quote.ohlc?.low    || 0,
        iv,
        delta:    greeks?.delta  || null,
        gamma:    greeks?.gamma  || null,
        theta:    greeks?.theta  || null,
        vega:     greeks?.vega   || null,
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
