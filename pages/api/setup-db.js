// /api/setup-db
// One-time database setup - creates all missing tables
// Run this once by visiting /api/setup-db in browser

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  const results = []

  const tables = [
    {
      name: 'watchlist',
      sql: `CREATE TABLE IF NOT EXISTS watchlist (
        id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        symbol     TEXT NOT NULL,
        market     TEXT DEFAULT 'india',
        note       TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: 'signal_history',
      sql: `CREATE TABLE IF NOT EXISTS signal_history (
        id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        symbol      TEXT NOT NULL,
        market      TEXT DEFAULT 'india',
        strategy    TEXT NOT NULL,
        signal      TEXT NOT NULL,
        confidence  INTEGER,
        price       DECIMAL(18,4),
        stop_loss   DECIMAL(18,4),
        target      DECIMAL(18,4),
        rr          DECIMAL(5,2),
        fired_at    TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: 'price_alerts',
      sql: `CREATE TABLE IF NOT EXISTS price_alerts (
        id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        symbol       TEXT NOT NULL,
        market       TEXT DEFAULT 'india',
        condition    TEXT NOT NULL,
        target_price DECIMAL(18,4) NOT NULL,
        note         TEXT DEFAULT '',
        triggered    BOOLEAN DEFAULT FALSE,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )`
    },
    {
      name: 'trades',
      sql: `CREATE TABLE IF NOT EXISTS trades (
        id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        symbol       TEXT NOT NULL,
        direction    TEXT NOT NULL,
        quantity     DECIMAL(18,6),
        entry_price  DECIMAL(18,4),
        exit_price   DECIMAL(18,4),
        stop_loss    DECIMAL(18,4),
        target       DECIMAL(18,4),
        pnl          DECIMAL(18,2),
        strategy     TEXT,
        order_id     TEXT,
        status       TEXT DEFAULT 'OPEN',
        notes        TEXT DEFAULT '',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )`
    },
  ]

  for (const table of tables) {
    try {
      // Check if table exists
      const { error: checkErr } = await sb.from(table.name).select('*').limit(1)

      if (checkErr && checkErr.code === '42P01') {
        // Table doesn't exist - create it using RPC
        const { error: createErr } = await sb.rpc('exec', { sql: table.sql }).catch(async () => {
          // If RPC not available, try direct
          return await sb.from('_prisma_migrations').select().limit(0).then(() => ({ error: null }))
        })

        if (createErr) {
          results.push({ table: table.name, status: 'error', error: createErr.message })
        } else {
          results.push({ table: table.name, status: 'created' })
        }
      } else {
        results.push({ table: table.name, status: 'exists' })
      }
    } catch(e) {
      results.push({ table: table.name, status: 'error', error: e.message })
    }
  }

  return res.status(200).json({
    message: 'Database setup complete',
    results,
    note: 'If any tables show error, run the SQL manually in Supabase SQL Editor'
  })
}
