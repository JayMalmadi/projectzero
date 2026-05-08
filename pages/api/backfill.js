// /api/backfill
// One-time + daily historical data loader
// Populates ohlcv_15min and ohlcv_daily tables in Supabase
// Crypto: Delta Exchange (no auth, always works)
// India: Kite Historical API (needs login) with Yahoo fallback

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE  = 'https://api.kite.trade'
const DELTA_BASE = 'https://api.india.delta.exchange'
const KITE_KEY   = process.env.KITE_API_KEY

// Kite instrument tokens
const KITE_TOKENS = {
  NIFTY:     '256265',
  BANKNIFTY: '260105',
  FINNIFTY:  '257801',
}

// Delta symbols
const DELTA_SYMBOLS = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
}

// ── Fetch Delta 15min candles ──────────────────────────────────
async function fetchDelta15min(symbol, daysBack = 60) {
  const deltaSymbol = DELTA_SYMBOLS[symbol]
  if (!deltaSymbol) return []

  const now   = Math.floor(Date.now() / 1000)
  const start = now - daysBack * 86400
  const candles = []

  // Fetch in chunks of 200 candles (Delta limit)
  let end = now
  while (end > start) {
    const chunkStart = Math.max(start, end - 200 * 900) // 200 x 15min
    const r = await fetch(
      `${DELTA_BASE}/v2/history/candles?symbol=${deltaSymbol}&resolution=15m&start=${chunkStart}&end=${end}`,
      { headers: { 'User-Agent': 'projectzero/1.0' } }
    )
    const d = await r.json()
    const chunk = d.result || []
    if (!chunk.length) break
    candles.push(...chunk)
    end = chunk[chunk.length - 1].time - 1 // move back
    if (chunk.length < 100) break // less than full page = done
  }

  return candles.map(c => ({
    symbol,
    market:  'crypto',
    ts:      new Date(c.time * 1000).toISOString(),
    open:    parseFloat(c.open),
    high:    parseFloat(c.high),
    low:     parseFloat(c.low),
    close:   parseFloat(c.close),
    volume:  parseFloat(c.volume || 0),
  }))
}

// ── Fetch Delta daily candles ──────────────────────────────────
async function fetchDeltaDaily(symbol, daysBack = 365) {
  const deltaSymbol = DELTA_SYMBOLS[symbol]
  if (!deltaSymbol) return []

  const now   = Math.floor(Date.now() / 1000)
  const start = now - daysBack * 86400
  const r = await fetch(
    `${DELTA_BASE}/v2/history/candles?symbol=${deltaSymbol}&resolution=1d&start=${start}&end=${now}`,
    { headers: { 'User-Agent': 'projectzero/1.0' } }
  )
  const d = await r.json()
  return (d.result || []).map(c => ({
    symbol,
    market: 'crypto',
    date:   new Date(c.time * 1000).toISOString().split('T')[0],
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume || 0),
  }))
}

// ── Fetch Kite 15min candles ───────────────────────────────────
async function fetchKite15min(symbol, accessToken, daysBack = 60) {
  const token = KITE_TOKENS[symbol]
  if (!token || !accessToken) return fetchYahoo15min(symbol)

  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - daysBack)

  const fromStr = from.toISOString().split('T')[0] + ' 09:15:00'
  const toStr   = to.toISOString().split('T')[0]   + ' 15:30:00'

  const r = await fetch(
    `${KITE_BASE}/instruments/historical/${token}/15minute?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&continuous=0`,
    { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${KITE_KEY}:${accessToken}` } }
  )
  const d = await r.json()
  if (d.status !== 'success') return fetchYahoo15min(symbol)

  return (d.data?.candles || []).map(c => ({
    symbol,
    market: 'india',
    ts:     new Date(c[0]).toISOString(),
    open:   parseFloat(c[1]),
    high:   parseFloat(c[2]),
    low:    parseFloat(c[3]),
    close:  parseFloat(c[4]),
    volume: parseFloat(c[5] || 0),
  }))
}

// ── Yahoo Finance 15min fallback ───────────────────────────────
async function fetchYahoo15min(symbol) {
  const yahooMap = { NIFTY: '%5ENSEI', BANKNIFTY: '%5ENSEBANK', FINNIFTY: '%5ECNXFIN' }
  const ticker = yahooMap[symbol]
  if (!ticker) return []

  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=60d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  const d = await r.json()
  const result = d?.chart?.result?.[0]
  if (!result) return []

  const ts  = result.timestamp || []
  const q   = result.indicators.quote[0]
  return ts.map((t, i) => ({
    symbol,
    market: 'india',
    ts:     new Date(t * 1000).toISOString(),
    open:   parseFloat((q.open[i] || 0).toFixed(2)),
    high:   parseFloat((q.high[i] || 0).toFixed(2)),
    low:    parseFloat((q.low[i]  || 0).toFixed(2)),
    close:  parseFloat((q.close[i]|| 0).toFixed(2)),
    volume: parseFloat(q.volume[i] || 0),
  })).filter(c => c.close > 0)
}

// ── Fetch Kite daily candles ───────────────────────────────────
async function fetchKiteDaily(symbol, accessToken, daysBack = 730) {
  const token = KITE_TOKENS[symbol]
  if (!token || !accessToken) return fetchYahooDaily(symbol)

  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - daysBack)

  const r = await fetch(
    `${KITE_BASE}/instruments/historical/${token}/day?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&continuous=0`,
    { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${KITE_KEY}:${accessToken}` } }
  )
  const d = await r.json()
  if (d.status !== 'success') return fetchYahooDaily(symbol)

  return (d.data?.candles || []).map(c => ({
    symbol,
    market: 'india',
    date:   c[0].split('T')[0],
    open:   parseFloat(c[1]),
    high:   parseFloat(c[2]),
    low:    parseFloat(c[3]),
    close:  parseFloat(c[4]),
    volume: parseFloat(c[5] || 0),
  }))
}

// ── Yahoo Finance daily fallback ───────────────────────────────
async function fetchYahooDaily(symbol) {
  const yahooMap = { NIFTY: '%5ENSEI', BANKNIFTY: '%5ENSEBANK', FINNIFTY: '%5ECNXFIN' }
  const ticker = yahooMap[symbol]
  if (!ticker) return []

  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  )
  const d = await r.json()
  const result = d?.chart?.result?.[0]
  if (!result) return []

  const ts = result.timestamp || []
  const q  = result.indicators.quote[0]
  return ts.map((t, i) => ({
    symbol,
    market: 'india',
    date:   new Date(t * 1000).toISOString().split('T')[0],
    open:   parseFloat((q.open[i] || 0).toFixed(2)),
    high:   parseFloat((q.high[i] || 0).toFixed(2)),
    low:    parseFloat((q.low[i]  || 0).toFixed(2)),
    close:  parseFloat((q.close[i]|| 0).toFixed(2)),
    volume: parseFloat(q.volume[i] || 0),
  })).filter(c => c.close > 0)
}

// ── Upsert candles to Supabase ─────────────────────────────────
async function upsertCandles(table, candles, batchSize = 500) {
  if (!candles.length) return 0
  let inserted = 0
  for (let i = 0; i < candles.length; i += batchSize) {
    const batch = candles.slice(i, i + batchSize)
    const { error } = await sb.from(table).upsert(batch, {
      onConflict: table === 'ohlcv_daily' ? 'symbol,date' : 'symbol,ts',
      ignoreDuplicates: true,
    })
    if (!error) inserted += batch.length
  }
  return inserted
}

// ── Main handler ───────────────────────────────────────────────
export default async function handler(req, res) {
  const { target = 'all', daysBack = '60' } = req.query
  const days = parseInt(daysBack)

  // Get Kite token if available
  let kiteToken = null
  try {
    const { data: session } = await sb.from('kite_session').select('access_token,expires_at').eq('id','current').single()
    if (session && new Date() < new Date(session.expires_at)) kiteToken = session.access_token
  } catch {}

  const results = {}
  const errors  = {}

  // ── Crypto 15min ──────────────────────────────────────────────
  if (target === 'all' || target === 'crypto_15min') {
    for (const sym of ['BTC','ETH','SOL','XRP']) {
      try {
        const candles = await fetchDelta15min(sym, days)
        const inserted = await upsertCandles('ohlcv_15min', candles)
        results[`${sym}_15min`] = inserted
      } catch(e) {
        errors[`${sym}_15min`] = e.message
      }
    }
  }

  // ── Crypto daily ──────────────────────────────────────────────
  if (target === 'all' || target === 'crypto_daily') {
    for (const sym of ['BTC','ETH','SOL','XRP']) {
      try {
        const candles = await fetchDeltaDaily(sym, Math.max(days * 3, 365))
        const inserted = await upsertCandles('ohlcv_daily', candles)
        results[`${sym}_daily`] = inserted
      } catch(e) {
        errors[`${sym}_daily`] = e.message
      }
    }
  }

  // ── India 15min ───────────────────────────────────────────────
  if (target === 'all' || target === 'india_15min') {
    for (const sym of ['NIFTY','BANKNIFTY','FINNIFTY']) {
      try {
        const candles = await fetchKite15min(sym, kiteToken, days)
        const inserted = await upsertCandles('ohlcv_15min', candles)
        results[`${sym}_15min`] = `${inserted} (source: ${kiteToken ? 'kite' : 'yahoo'})`
      } catch(e) {
        errors[`${sym}_15min`] = e.message
      }
    }
  }

  // ── India daily ───────────────────────────────────────────────
  if (target === 'all' || target === 'india_daily') {
    for (const sym of ['NIFTY','BANKNIFTY','FINNIFTY']) {
      try {
        const candles = await fetchKiteDaily(sym, kiteToken, Math.max(days * 3, 730))
        const inserted = await upsertCandles('ohlcv_daily', candles)
        results[`${sym}_daily`] = `${inserted} (source: ${kiteToken ? 'kite' : 'yahoo'})`
      } catch(e) {
        errors[`${sym}_daily`] = e.message
      }
    }
  }

  return res.status(200).json({
    status:     'done',
    kiteConnected: !!kiteToken,
    results,
    errors,
    message: Object.keys(errors).length === 0
      ? 'All backfill complete'
      : `Done with ${Object.keys(errors).length} errors`,
  })
}
