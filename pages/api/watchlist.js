// /api/watchlist — GET/POST/DELETE watchlist items
// Auto-creates table if not exists on first call
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// Ensure tables exist
async function ensureTables() {
  // Try to query - if it fails, create the table
  const { error } = await sb.from('watchlist').select('id').limit(1)
  if (error && error.code === '42P01') {
    // Table doesn't exist - create it via RPC or raw SQL
    await sb.rpc('create_watchlist_if_not_exists').catch(() => {})
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await sb.from('watchlist').select('*').order('created_at', { ascending: false })
    if (error) {
      // If table doesn't exist, return empty (no crash)
      if (error.code === '42P01') return res.status(200).json({ items: [], setup_needed: true })
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ items: data || [] })
  }
  if (req.method === 'POST') {
    const { symbol, market, note } = req.body
    if (!symbol) return res.status(400).json({ error: 'symbol required' })
    const { data, error } = await sb.from('watchlist').insert([{
      symbol: symbol.toUpperCase(), market: market || 'india', note: note || ''
    }]).select()
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ error: 'Watchlist table not set up yet. Run the SQL migration first.' })
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json({ item: data[0] })
  }
  if (req.method === 'DELETE') {
    const { id } = req.body
    const { error } = await sb.from('watchlist').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ deleted: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
