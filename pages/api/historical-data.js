// /api/historical-data
// Manages OHLCV historical data storage
// Actions:
//   backfill  - fetch and store historical candles (one-time)
//   status    - how much data we have per symbol
//   latest    - get latest candles for a symbol (for backtesting)

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE  = 'https://api.kite.trade'
const DELTA_BASE = 'https://api.india.delta.exchange'

// Kite instrument tokens
const KITE_TOKENS = {
  NIFTY:     '256265',
  BANKNIFTY: '260105',
  FINNIFTY:  '257801',
}

// Delta perpetual futures symbols
const DELTA_SYMBOLS = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
}

// Get Kite access token from Supabase
async function getKiteToken() {
  try {
    const { data } = await sb.from('kite_session')
      .select('access_token,expires_at').eq('id','current').single()
    if (!data || new Date() > new Date(data.expires_at)) return null
    return data.access_token
  } catch { return null }
}

// Fetch India 15min candles from Kite (max 60 days)
async function fetchKite15min(symbol, days, accessToken) {
  const token = KITE_TOKENS[symbol]
  if (!token || !accessToken) return []

  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - Math.min(days, 60))

  const fromStr = from.toISOString().split('T')[0] + ' 09:15:00'
  const toStr   = to.toISOString().split('T')[0] + ' 15:30:00'

  try {
    const r = await fetch(
      `${KITE_BASE}/instruments/historical/${token}/15minute?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&continuous=0&oi=0`,
      { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.KITE_API_KEY}:${accessToken}` } }
    )
    const d = await r.json()
    return (d.data?.candles || []).map(c => ({
      symbol, market: 'india',
      ts:     new Date(c[0]).toISOString(),
      open:   c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
    }))
  } catch(e) {
    console.error(`[HistData] Kite ${symbol} error:`, e.message)
    return []
  }
}

// Fetch India daily candles from Yahoo Finance (up to 10 years)
async function fetchYahooDaily(symbol, days) {
  const yahooMap = { NIFTY: '%5ENSEI', BANKNIFTY: '%5ENSEBANK', FINNIFTY: '%5ECNXFIN' }
  const ticker = yahooMap[symbol]
  if (!ticker) return []

  const range = days > 730 ? '10y' : days > 365 ? '5y' : days > 180 ? '2y' : '1y'
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const d = await r.json()
    const result = d?.chart?.result?.[0]
    if (!result) return []
    const ts = result.timestamp || []
    const q  = result.indicators?.quote?.[0] || {}
    return ts.map((t, i) => ({
      symbol, market: 'india',
      ts:     new Date(t * 1000).toISOString(),
      open:   parseFloat((q.open?.[i] || 0).toFixed(2)),
      high:   parseFloat((q.high?.[i] || 0).toFixed(2)),
      low:    parseFloat((q.low?.[i]  || 0).toFixed(2)),
      close:  parseFloat((q.close?.[i]|| 0).toFixed(2)),
      volume: q.volume?.[i] || 0,
    })).filter(c => c.close > 0)
  } catch(e) {
    console.error(`[HistData] Yahoo ${symbol} error:`, e.message)
    return []
  }
}

// Fetch crypto candles from Delta Exchange (paginated)
async function fetchDelta15min(symbol, days) {
  const deltaSym = DELTA_SYMBOLS[symbol]
  if (!deltaSym) return []

  const candles = []
  const now     = Math.floor(Date.now() / 1000)
  const oldest  = now - (days * 86400)
  const chunkSize = 200 // Delta max per call
  const interval  = 15 * 60 // 15 minutes in seconds

  let end = now
  let iterations = 0
  const maxIter = Math.ceil((days * 24 * 4) / chunkSize) + 1 // 4 candles/hour

  while (end > oldest && iterations < maxIter) {
    iterations++
    const start = Math.max(end - (chunkSize * interval), oldest)
    try {
      const r = await fetch(
        `${DELTA_BASE}/v2/history/candles?symbol=${deltaSym}&resolution=15m&start=${start}&end=${end}`,
        { headers: { 'User-Agent': 'projectzero/1.0' } }
      )
      const d = await r.json()
      const batch = (d.result || []).map(c => ({
        symbol, market: 'crypto',
        ts:     new Date(c.time * 1000).toISOString(),
        open:   parseFloat(c.open),
        high:   parseFloat(c.high),
        low:    parseFloat(c.low),
        close:  parseFloat(c.close),
        volume: parseFloat(c.volume),
      }))
      candles.push(...batch)
      if (batch.length < chunkSize) break // no more data
      end = start
    } catch(e) {
      console.error(`[HistData] Delta ${symbol} error:`, e.message)
      break
    }
  }
  return candles
}

// Fetch crypto daily from Delta
async function fetchDeltaDaily(symbol, days) {
  const deltaSym = DELTA_SYMBOLS[symbol]
  if (!deltaSym) return []
  try {
    const now   = Math.floor(Date.now() / 1000)
    const start = now - (days * 86400)
    const r = await fetch(
      `${DELTA_BASE}/v2/history/candles?symbol=${deltaSym}&resolution=1d&start=${start}&end=${now}`,
      { headers: { 'User-Agent': 'projectzero/1.0' } }
    )
    const d = await r.json()
    return (d.result || []).map(c => ({
      symbol, market: 'crypto',
      ts:     new Date(c.time * 1000).toISOString(),
      open:   parseFloat(c.open), high: parseFloat(c.high),
      low:    parseFloat(c.low),  close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    }))
  } catch(e) {
    console.error(`[HistData] Delta daily ${symbol}:`, e.message)
    return []
  }
}

// Upsert candles into Supabase in batches
async function upsertCandles(table, candles) {
  if (!candles.length) return 0
  const batchSize = 500
  let total = 0
  for (let i = 0; i < candles.length; i += batchSize) {
    const batch = candles.slice(i, i + batchSize)
    const { error } = await sb.from(table).upsert(batch, { onConflict: 'symbol,ts' })
    if (error) console.error(`[HistData] Upsert error:`, error.message)
    else total += batch.length
  }
  return total
}

async function upsertDaily(candles) {
  if (!candles.length) return 0
  // For daily, use date not ts
  const rows = candles.map(c => ({
    symbol: c.symbol, market: c.market,
    date:   c.ts.split('T')[0],
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }))
  const batchSize = 500
  let total = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await sb.from('ohlcv_daily').upsert(rows.slice(i, i+batchSize), { onConflict: 'symbol,date' })
    if (!error) total += rows.slice(i, i+batchSize).length
  }
  return total
}

export default async function handler(req, res) {
  const { action = 'status', symbol, market, days = 60 } = req.query

  // ── STATUS: how much data we have ─────────────────────────
  if (action === 'status') {
    const [daily15, daily] = await Promise.all([
      sb.from('ohlcv_15min').select('symbol, market, ts').order('ts', { ascending: false }),
      sb.from('ohlcv_daily').select('symbol, market, date').order('date', { ascending: false }),
    ])

    const summarize = (rows) => {
      const bySymbol = {}
      for (const r of rows || []) {
        if (!bySymbol[r.symbol]) bySymbol[r.symbol] = { count: 0, newest: r.ts||r.date, oldest: r.ts||r.date, market: r.market }
        bySymbol[r.symbol].count++
        if ((r.ts||r.date) < bySymbol[r.symbol].oldest) bySymbol[r.symbol].oldest = r.ts||r.date
      }
      return bySymbol
    }

    return res.status(200).json({
      status: 'success',
      intraday_15min: summarize(daily15.data),
      daily:          summarize(daily.data),
    })
  }

  // ── BACKFILL: fetch and store historical data ──────────────
  if (action === 'backfill') {
    const results = {}
    const daysNum = parseInt(days)
    const accessToken = await getKiteToken()

    // India 15min (requires Kite login)
    if (!market || market === 'india') {
      for (const sym of ['NIFTY', 'BANKNIFTY', 'FINNIFTY']) {
        const candles = await fetchKite15min(sym, Math.min(daysNum, 60), accessToken)
        const saved = await upsertCandles('ohlcv_15min', candles)
        results[`${sym}_15min`] = { fetched: candles.length, saved }
      }
      // India daily (Yahoo, no auth needed)
      for (const sym of ['NIFTY', 'BANKNIFTY', 'FINNIFTY']) {
        const candles = await fetchYahooDaily(sym, daysNum)
        const saved = await upsertDaily(candles)
        results[`${sym}_daily`] = { fetched: candles.length, saved }
      }
    }

    // Crypto (Delta, no auth)
    if (!market || market === 'crypto') {
      for (const sym of ['BTC', 'ETH', 'SOL', 'XRP']) {
        const candles15 = await fetchDelta15min(sym, Math.min(daysNum, 60))
        const saved15   = await upsertCandles('ohlcv_15min', candles15)
        results[`${sym}_15min`] = { fetched: candles15.length, saved: saved15 }

        const candlesD = await fetchDeltaDaily(sym, daysNum)
        const savedD   = await upsertDaily(candlesD)
        results[`${sym}_daily`] = { fetched: candlesD.length, saved: savedD }
      }
    }

    return res.status(200).json({ status: 'success', results })
  }

  // ── LATEST: get stored candles for a symbol ────────────────
  if (action === 'latest') {
    const table    = req.query.timeframe === 'daily' ? null : 'ohlcv_15min'
    const limit    = parseInt(req.query.limit || 500)

    if (!symbol) return res.status(400).json({ error: 'symbol required' })

    if (req.query.timeframe === 'daily') {
      const { data, error } = await sb.from('ohlcv_daily')
        .select('date,open,high,low,close,volume')
        .eq('symbol', symbol)
        .order('date', { ascending: false })
        .limit(limit)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ status:'success', symbol, timeframe:'daily', candles: (data||[]).reverse() })
    }

    const { data, error } = await sb.from('ohlcv_15min')
      .select('ts,open,high,low,close,volume')
      .eq('symbol', symbol)
      .order('ts', { ascending: false })
      .limit(limit)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({
      status: 'success', symbol,
      timeframe: '15min',
      candles: (data||[]).reverse().map(c => ({ ...c, time: new Date(c.ts).getTime()/1000 }))
    })
  }

  return res.status(400).json({ error: 'action must be: status | backfill | latest' })
}
