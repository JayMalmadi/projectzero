// /api/watchlist — GET/POST/DELETE watchlist items
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await sb.from('watchlist').select('*').order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ items: data || [] })
  }
  if (req.method === 'POST') {
    const { symbol, market, note } = req.body
    if (!symbol) return res.status(400).json({ error: 'symbol required' })
    const { data, error } = await sb.from('watchlist').insert([{
      symbol: symbol.toUpperCase(), market: market || 'india', note: note || ''
    }]).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ item: data[0] })
  }
  if (req.method === 'DELETE') {
    const { id } = req.body
    await sb.from('watchlist').delete().eq('id', id)
    return res.status(200).json({ deleted: true })
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
