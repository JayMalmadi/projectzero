// pages/api/run-migrations.js
// One-time setup: creates all required Supabase tables
// Call: GET /api/run-migrations?secret=pz-migrate-2026

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.query.secret !== 'pz-migrate-2026') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const results = {}

  // Create each table by inserting a test row and catching the error
  // Supabase JS client can't run raw DDL directly
  // But we can use the REST API with service key

  const DDL = [
    [`CREATE TABLE IF NOT EXISTS watchlist (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT DEFAULT 'india',
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'watchlist'],
    [`CREATE TABLE IF NOT EXISTS price_alerts (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT DEFAULT 'india',
      condition TEXT NOT NULL,
      target_price DECIMAL(18,4) NOT NULL,
      note TEXT DEFAULT '',
      triggered BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'price_alerts'],
    [`CREATE TABLE IF NOT EXISTS trades (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL,
      quantity DECIMAL(18,6),
      entry_price DECIMAL(18,4),
      exit_price DECIMAL(18,4),
      stop_loss DECIMAL(18,4),
      target DECIMAL(18,4),
      pnl DECIMAL(18,2),
      strategy TEXT,
      order_id TEXT,
      notes TEXT,
      status TEXT DEFAULT 'OPEN',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`, 'trades'],
  ]

  for (const [sql, name] of DDL) {
    try {
      // Use Supabase management API endpoint
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY }
      })
      // Try inserting to see if table exists
      const { error } = await sb.from(name).select('id').limit(1)
      if (error && error.code === '42P01') {
        // Table doesn't exist - this is expected
        results[name] = 'needs_creation'
      } else {
        results[name] = 'already_exists'
      }
    } catch(e) {
      results[name] = `error: ${e.message}`
    }
  }

  // For actual table creation, use pg via Supabase SQL API
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const createResults = {}
  for (const [sql, name] of DDL) {
    if (results[name] === 'needs_creation') {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
          },
          body: JSON.stringify({ sql })
        })
        createResults[name] = r.ok ? 'created' : `failed_${r.status}`
      } catch(e) {
        createResults[name] = `error: ${e.message}`
      }
    } else {
      createResults[name] = results[name]
    }
  }

  return res.status(200).json({
    message: 'Migration check complete',
    tableStatus: results,
    createAttempts: createResults,
    note: 'If tables show needs_creation and creation failed, run the SQL manually in Supabase SQL Editor'
  })
}
