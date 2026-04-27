// pages/api/trades.js
// Trade history — GET (fetch), POST (save), PATCH (update P&L)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {

  // ── GET — fetch trade history ────────────────────────
  if (req.method === 'GET') {
    const { limit = 50, status } = req.query
    let query = supabase
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ trades: data || [] })
  }

  // ── POST — save a new trade ──────────────────────────
  if (req.method === 'POST') {
    const {
      symbol, direction, quantity, entry_price,
      stop_loss, target, strategy, order_id, notes
    } = req.body

    const { data, error } = await supabase.from('trades').insert([{
      symbol, direction, quantity,
      entry_price: parseFloat(entry_price),
      stop_loss:   stop_loss ? parseFloat(stop_loss) : null,
      target:      target    ? parseFloat(target)    : null,
      strategy, order_id, notes,
      status: 'OPEN',
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ trade: data[0] })
  }

  // ── PATCH — close a trade + calculate P&L ───────────
  if (req.method === 'PATCH') {
    const { id, exit_price, notes } = req.body
    if (!id || !exit_price) return res.status(400).json({ error: 'id and exit_price required' })

    // Get the trade first
    const { data: existing } = await supabase.from('trades').select('*').eq('id', id).single()
    if (!existing) return res.status(404).json({ error: 'Trade not found' })

    const exitPx = parseFloat(exit_price)
    const pnl = existing.direction === 'BUY'
      ? (exitPx - existing.entry_price) * existing.quantity
      : (existing.entry_price - exitPx) * existing.quantity

    const { data, error } = await supabase.from('trades').update({
      exit_price: exitPx,
      pnl:        parseFloat(pnl.toFixed(2)),
      status:     'CLOSED',
      notes:      notes || existing.notes,
    }).eq('id', id).select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ trade: data[0], pnl })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
