// /api/backfill-ohlcv
// One-time historical data backfill
// Fetches India data from Yahoo Finance, Crypto from Delta Exchange
// Stores in Supabase ohlcv table
// Call: POST /api/backfill-ohlcv with { symbol, timeframe } or { all: true }

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// ── Config ────────────────────────────────────────────────────
const INDIA_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY']
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP']

const YAHOO_MAP = {
  NIFTY:     '%5ENSEI',
  BANKNIFTY: '%5ENSEBANK',
  FINNIFTY:  '%5ECNXFIN',
}

const DELTA_MAP = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
}

const TIMEFRAMES = {
  india: [
    { tf: '5min',  yahooInterval: '5m',  yahooRange: '60d'  },
    { tf: '15min', yahooInterval: '15m', yahooRange: '60d'  },
    { tf: '1h',    yahooInterval: '1h',  yahooRange: '2y'   },
    { tf: '1d',    yahooInterval: '1d',  yahooRange: '10y'  },
  ],
  crypto: [
    { tf: '15min', deltaRes: '15m', daysBack: 42  },
    { tf: '1d',    deltaRes: '1d',  daysBack: 730 },
  ],
}

// ── Fetch India candles from Yahoo Finance ────────────────────
async function fetchIndia(symbol, yahooInterval, yahooRange) {
  const yticker = YAHOO_MAP[symbol]
  if (!yticker) throw new Error(`Unknown India symbol: ${symbol}`)

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yticker}?interval=${yahooInterval}&range=${yahooRange}`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const d = await r.json()

  const result = d?.chart?.result?.[0]
  if (!result) throw new Error(`No Yahoo data for ${symbol}`)

  const ts     = result.timestamp || []
  const q      = result.indicators.quote[0]
  const opens  = q.open   || []
  const highs  = q.high   || []
  const lows   = q.low    || []
  const closes = q.close  || []
  const vols   = q.volume || []

  return ts.map((t, i) => ({
    ts:     new Date(t * 1000).toISOString(),
    open:   opens[i]  != null ? parseFloat(opens[i].toFixed(4))  : null,
    high:   highs[i]  != null ? parseFloat(highs[i].toFixed(4))  : null,
    low:    lows[i]   != null ? parseFloat(lows[i].toFixed(4))   : null,
    close:  closes[i] != null ? parseFloat(closes[i].toFixed(4)) : null,
    volume: vols[i]   != null ? parseFloat(vols[i])              : 0,
  })).filter(c => c.open && c.close && !isNaN(c.close))
}

// ── Fetch Crypto candles from Delta Exchange ──────────────────
async function fetchCrypto(symbol, deltaRes, daysBack) {
  const deltaSym = DELTA_MAP[symbol]
  if (!deltaSym) throw new Error(`Unknown crypto symbol: ${symbol}`)

  const now   = Math.floor(Date.now() / 1000)
  const resSec = { '15m': 900, '1d': 86400 }[deltaRes] || 900
  const start = now - daysBack * 86400

  // Delta returns max 200 per call — paginate if needed
  const candles = []
  let pageStart = start

  while (pageStart < now) {
    const pageEnd = Math.min(pageStart + 200 * resSec, now)
    const url = `https://api.india.delta.exchange/v2/history/candles?symbol=${deltaSym}&resolution=${deltaRes}&start=${pageStart}&end=${pageEnd}`
    const r = await fetch(url, { headers: { 'User-Agent': 'projectzero/1.0' } })
    const d = await r.json()
    const batch = d.result || []
    if (!batch.length) break

    for (const c of batch) {
      candles.push({
        ts:     new Date(c.time * 1000).toISOString(),
        open:   parseFloat(c.open),
        high:   parseFloat(c.high),
        low:    parseFloat(c.low),
        close:  parseFloat(c.close),
        volume: parseFloat(c.volume),
      })
    }
    pageStart = pageEnd + 1
    if (batch.length < 200) break
    await new Promise(r => setTimeout(r, 200)) // be nice to Delta
  }

  return candles
}

// ── Store candles in Supabase ─────────────────────────────────
async function storeCandles(symbol, market, timeframe, candles) {
  if (!candles.length) return 0

  const rows = candles.map(c => ({
    symbol, market, timeframe,
    ts:     c.ts,
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume,
  }))

  // Upsert in batches of 500
  let stored = 0
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500)
    const { error } = await sb.from('ohlcv').upsert(batch, {
      onConflict: 'symbol,timeframe,ts',
      ignoreDuplicates: true,
    })
    if (error) console.error(`[Backfill] Store error:`, error.message)
    else stored += batch.length
  }

  // Update status
  const dates = candles.map(c => c.ts).sort()
  await sb.from('ohlcv_backfill_status').upsert({
    symbol, timeframe, market,
    from_date:    dates[0]?.split('T')[0],
    to_date:      dates[dates.length-1]?.split('T')[0],
    row_count:    stored,
    last_updated: new Date().toISOString(),
  }, { onConflict: 'symbol,timeframe' })

  return stored
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }

  const { symbol, timeframe, all } = req.body || {}
  const results = []

  try {
    // Build job list
    const jobs = []

    if (all || (!symbol && !timeframe)) {
      // Backfill everything
      for (const sym of INDIA_SYMBOLS) {
        for (const tf of TIMEFRAMES.india) {
          jobs.push({ symbol: sym, market: 'india', ...tf })
        }
      }
      for (const sym of CRYPTO_SYMBOLS) {
        for (const tf of TIMEFRAMES.crypto) {
          jobs.push({ symbol: sym, market: 'crypto', ...tf })
        }
      }
    } else {
      // Single job
      const market = CRYPTO_SYMBOLS.includes(symbol) ? 'crypto' : 'india'
      const tfList = TIMEFRAMES[market]
      const tfConfig = tfList.find(t => t.tf === timeframe)
      if (tfConfig) jobs.push({ symbol, market, ...tfConfig })
    }

    // Run jobs sequentially to avoid rate limits
    for (const job of jobs) {
      try {
        console.log(`[Backfill] Fetching ${job.symbol} ${job.tf}...`)
        let candles = []

        if (job.market === 'india') {
          candles = await fetchIndia(job.symbol, job.yahooInterval, job.yahooRange)
        } else {
          candles = await fetchCrypto(job.symbol, job.deltaRes, job.daysBack)
        }

        const stored = await storeCandles(job.symbol, job.market, job.tf, candles)
        results.push({ symbol: job.symbol, timeframe: job.tf, fetched: candles.length, stored })
        console.log(`[Backfill] ${job.symbol} ${job.tf}: ${stored} rows stored`)

      } catch(e) {
        console.error(`[Backfill] ${job.symbol} ${job.tf}: ${e.message}`)
        results.push({ symbol: job.symbol, timeframe: job.tf, error: e.message })
      }

      // Small delay between fetches
      await new Promise(r => setTimeout(r, 300))
    }

    const totalStored = results.reduce((a, r) => a + (r.stored || 0), 0)
    return res.status(200).json({
      status: 'success',
      jobs:   results.length,
      totalStored,
      results,
    })

  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
