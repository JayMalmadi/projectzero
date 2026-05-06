// /api/paper-trades
// Auto paper trading engine — CRUD for paper trades
// Worker calls POST to create, PATCH to update status, GET to read

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {

  // GET — fetch paper trades
  if (req.method === 'GET') {
    const { status, strategy, symbol, days = 30, limit = 100 } = req.query
    const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString()

    let q = sb.from('paper_trades')
      .select('*')
      .gte('opened_at', since)
      .order('opened_at', { ascending: false })
      .limit(parseInt(limit))

    if (status)   q = q.eq('status', status)
    if (strategy) q = q.eq('strategy', strategy)
    if (symbol)   q = q.eq('symbol', symbol)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    const all    = data || []
    const closed = all.filter(t => ['WIN','LOSS','EXPIRED','CLOSED'].includes(t.status))
    const wins   = closed.filter(t => t.status === 'WIN')
    const losses = closed.filter(t => t.status === 'LOSS')
    const winRate = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : null
    const avgWin  = wins.length   ? (wins.reduce((a,t)=>a+(t.pnl_pct||0),0)/wins.length).toFixed(2)   : 0
    const avgLoss = losses.length ? (losses.reduce((a,t)=>a+(t.pnl_pct||0),0)/losses.length).toFixed(2) : 0
    const expectancy = winRate ? (((winRate/100)*avgWin) + (((100-winRate)/100)*avgLoss)).toFixed(2) : null

    // Group by strategy
    const byStrategy = {}
    for (const t of closed) {
      if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { total:0, wins:0, losses:0, pnl:0 }
      byStrategy[t.strategy].total++
      if (t.status==='WIN') byStrategy[t.strategy].wins++
      else byStrategy[t.strategy].losses++
      byStrategy[t.strategy].pnl += t.pnl_pct || 0
    }

    return res.status(200).json({
      trades: all,
      open:   all.filter(t => t.status === 'OPEN'),
      stats: {
        total: all.length, open: all.filter(t=>t.status==='OPEN').length,
        closed: closed.length, wins: wins.length, losses: losses.length,
        winRate, avgWin, avgLoss, expectancy,
      },
      byStrategy,
    })
  }

  // POST — create new paper trade
  if (req.method === 'POST') {
    const {
      symbol, strategy, market = 'india', direction, signal_type = 'intraday',
      entry_price, stop_loss, target, rr, confidence, quantity = 1,
      option_symbol, option_strike, option_type, option_expiry,
      option_entry_price, option_sl, option_target, notes,
    } = req.body

    if (!symbol || !strategy || !direction || !entry_price) {
      return res.status(400).json({ error: 'symbol, strategy, direction, entry_price required' })
    }

    // Prevent duplicate: one paper trade per strategy+symbol per day
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await sb.from('paper_trades')
      .select('id')
      .eq('symbol', symbol)
      .eq('strategy', strategy)
      .eq('status', 'OPEN')
      .gte('opened_at', `${today}T00:00:00Z`)
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(200).json({ created: false, reason: 'Already have open paper trade for this strategy+symbol today' })
    }

    const { data, error } = await sb.from('paper_trades').insert([{
      symbol, strategy, market, direction, signal_type,
      entry_price: parseFloat(entry_price),
      stop_loss:   stop_loss ? parseFloat(stop_loss) : null,
      target:      target    ? parseFloat(target)    : null,
      rr:          rr        ? parseFloat(rr)        : null,
      confidence:  confidence || 0,
      quantity:    parseInt(quantity) || 1,
      option_symbol, option_strike, option_type, option_expiry,
      option_entry_price, option_sl, option_target,
      notes: notes || '',
      status: 'OPEN',
      opened_at: new Date().toISOString(),
      signal_fired_at: new Date().toISOString(),
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ created: true, trade: data[0] })
  }

  // PATCH — update paper trade status (called by monitor)
  if (req.method === 'PATCH') {
    const { id, status, exit_price, exit_reason, pnl_points, pnl_pct } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    const updates = { monitored_at: new Date().toISOString() }
    if (status)      updates.status      = status
    if (exit_price)  updates.exit_price  = parseFloat(exit_price)
    if (exit_reason) updates.exit_reason = exit_reason
    if (pnl_points !== undefined) updates.pnl_points = parseFloat(pnl_points)
    if (pnl_pct !== undefined)    updates.pnl_pct    = parseFloat(pnl_pct)
    if (['WIN','LOSS','EXPIRED','CLOSED'].includes(status)) {
      updates.closed_at = new Date().toISOString()
    }

    const { error } = await sb.from('paper_trades').update(updates).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ updated: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
