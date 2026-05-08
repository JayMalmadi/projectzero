// /api/setup-db
// Creates all required Supabase tables
// Run once: /api/setup-db?action=create

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  const { action } = req.query
  if (action !== 'create') return res.status(400).json({ error: 'Use ?action=create' })

  const results = {}

  // NFO instruments cache — stores parsed option instruments per symbol
  // Refreshed daily — avoids 5MB download on every options chain request
  try {
    await sb.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS nfo_instruments_cache (
        symbol           TEXT PRIMARY KEY,
        cached_date      DATE NOT NULL,
        instruments_json TEXT NOT NULL,
        count            INT  DEFAULT 0,
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `})
    results.nfo_instruments_cache = 'created'
  } catch(e) {
    // Try direct insert to check if table exists
    try {
      await sb.from('nfo_instruments_cache').select('symbol').limit(1)
      results.nfo_instruments_cache = 'already exists'
    } catch {
      results.nfo_instruments_cache = 'error: ' + e.message
    }
  }

  // Historical OHLCV storage — for backtesting
  try {
    await sb.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS ohlcv_daily (
        id         BIGSERIAL PRIMARY KEY,
        symbol     TEXT NOT NULL,
        market     TEXT NOT NULL DEFAULT 'india',
        date       DATE NOT NULL,
        open       NUMERIC(12,4),
        high       NUMERIC(12,4),
        low        NUMERIC(12,4),
        close      NUMERIC(12,4),
        volume     BIGINT,
        UNIQUE(symbol, date)
      );
      CREATE INDEX IF NOT EXISTS idx_ohlcv_daily_symbol_date ON ohlcv_daily(symbol, date DESC);
    `})
    results.ohlcv_daily = 'created'
  } catch(e) {
    results.ohlcv_daily = 'error: ' + e.message
  }

  return res.status(200).json({ status: 'done', results })
}
