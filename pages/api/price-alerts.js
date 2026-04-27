// /api/price-alerts
// GET  — fetch all alerts
// POST — create alert
// DELETE — remove alert

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ alerts: data || [] })
  }

  if (req.method === 'POST') {
    const { symbol, market, condition, price, note } = req.body
    if (!symbol || !condition || !price)
      return res.status(400).json({ error: 'symbol, condition and price required' })

    const { data, error } = await supabase.from('price_alerts').insert([{
      symbol, market: market || 'india',
      condition, // 'above' or 'below'
      target_price: parseFloat(price),
      note: note || '',
      triggered: false,
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ alert: data[0] })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { error } = await supabase.from('price_alerts').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ deleted: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
