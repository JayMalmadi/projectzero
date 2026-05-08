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

    // ── Per-strategy breakdown (fixed base: ₹10k INR / $1k USD) ──
    const BASE_INR = 10000
    const BASE_USD = 1000
    const byStrategy = {}
    for (const t of closed) {
      const s = t.strategy
      if (!byStrategy[s]) byStrategy[s] = {
        total:0, wins:0, losses:0,
        pnl_pts: 0, pnl_pct: 0,
        market: t.market || 'india',
        avgRR: 0, rrList: [],
        bestTrade: null, worstTrade: null,
      }
      byStrategy[s].total++
      if (t.status==='WIN') byStrategy[s].wins++
      else byStrategy[s].losses++

      // P&L as % of fixed base capital
      const base = (t.market === 'crypto' || t.market === 'delta') ? BASE_USD : BASE_INR
      const pnlPts = t.pnl_points || 0
      const pnlPct = parseFloat(((pnlPts / base) * 100).toFixed(4))
      byStrategy[s].pnl_pts  += pnlPts
      byStrategy[s].pnl_pct  += pnlPct

      if (t.rr) byStrategy[s].rrList.push(parseFloat(t.rr))

      // Track best/worst
      if (!byStrategy[s].bestTrade  || pnlPct > byStrategy[s].bestTrade.pnl_pct)  byStrategy[s].bestTrade  = { symbol:t.symbol, pnl_pct: pnlPct, date: t.closed_at }
      if (!byStrategy[s].worstTrade || pnlPct < byStrategy[s].worstTrade.pnl_pct) byStrategy[s].worstTrade = { symbol:t.symbol, pnl_pct: pnlPct, date: t.closed_at }
    }

    // Finalize per-strategy stats
    for (const s of Object.keys(byStrategy)) {
      const st = byStrategy[s]
      st.winRate    = st.total > 0 ? parseFloat(((st.wins/st.total)*100).toFixed(1)) : 0
      st.pnl_pct    = parseFloat(st.pnl_pct.toFixed(2))
      st.avgRR      = st.rrList.length ? parseFloat((st.rrList.reduce((a,b)=>a+b,0)/st.rrList.length).toFixed(2)) : 0
      st.expectancy = parseFloat(((st.winRate/100)*(st.pnl_pct/Math.max(st.wins,1))) + (((100-st.winRate)/100)*(st.pnl_pct/Math.max(st.losses,1)))).toFixed(2)
      delete st.rrList
    }

    // ── Monthly summary ─────────────────────────────────────
    const totalPnlPct = Object.values(byStrategy).reduce((a,s) => a + s.pnl_pct, 0)
    const monthly = {
      base_capital: { INR: BASE_INR, USD: BASE_USD },
      risk_per_trade_pct: 1.0,
      total_pnl_pct: parseFloat(totalPnlPct.toFixed(2)),
      total_pnl_inr: parseFloat(((totalPnlPct / 100) * BASE_INR).toFixed(2)),
      strategies_ranked: Object.entries(byStrategy)
        .sort((a,b) => b[1].pnl_pct - a[1].pnl_pct)
        .map(([name, st]) => ({ name, ...st })),
    }

    // ── Time-based analysis ───────────────────────────────────
    // Best/worst hour of day and day of week from closed trades
    const byHour = {}
    const byDay  = { Mon:[], Tue:[], Wed:[], Thu:[], Fri:[], Sat:[], Sun:[] }
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

    for (const t of closed) {
      if (!t.opened_at) continue
      const dt  = new Date(t.opened_at)
      const hr  = dt.getUTCHours()  // UTC hour
      const day = dayNames[dt.getUTCDay()]
      const pct = t.pnl_pct || 0

      if (!byHour[hr]) byHour[hr] = { wins:0, losses:0, pnl:0, count:0 }
      byHour[hr].count++
      byHour[hr].pnl += pct
      if (t.status === 'WIN') byHour[hr].wins++
      else byHour[hr].losses++

      if (byDay[day]) byDay[day].push(pct)
    }

    const hourStats = Object.entries(byHour).map(([h, s]) => ({
      hour:    parseInt(h),
      hourIST: ((parseInt(h) + 5) % 24) + ':' + (30 > 9 ? '30' : '30'),
      count:   s.count,
      winRate: s.count > 0 ? Math.round(s.wins/s.count*100) : 0,
      avgPnl:  s.count > 0 ? parseFloat((s.pnl/s.count).toFixed(2)) : 0,
    })).sort((a,b) => a.hour - b.hour)

    const dayStats = Object.entries(byDay).map(([day, pnls]) => ({
      day,
      count:   pnls.length,
      avgPnl:  pnls.length > 0 ? parseFloat((pnls.reduce((a,b)=>a+b,0)/pnls.length).toFixed(2)) : 0,
      winRate: pnls.length > 0 ? Math.round(pnls.filter(p=>p>0).length/pnls.length*100) : 0,
    }))

    // ── Drawdown calculation ──────────────────────────────────
    let peak = 0, maxDrawdown = 0, runningPnl = 0
    const equity = []
    for (const t of closed.sort((a,b) => new Date(a.closed_at)-new Date(b.closed_at))) {
      runningPnl += t.pnl_pct || 0
      equity.push({ date: t.closed_at?.split('T')[0], pnl: parseFloat(runningPnl.toFixed(2)) })
      if (runningPnl > peak) peak = runningPnl
      const dd = peak - runningPnl
      if (dd > maxDrawdown) maxDrawdown = dd
    }

    // ── Streak analysis ───────────────────────────────────────
    let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0
    let lastResult = null
    for (const t of closed.sort((a,b) => new Date(a.closed_at)-new Date(b.closed_at))) {
      const res = t.status === 'WIN' ? 'W' : 'L'
      if (res === lastResult) { curStreak++ }
      else { curStreak = 1; lastResult = res }
      if (res === 'W' && curStreak > maxWinStreak)  maxWinStreak  = curStreak
      if (res === 'L' && curStreak > maxLossStreak) maxLossStreak = curStreak
    }

    return res.status(200).json({
      trades: all,
      open:   all.filter(t => t.status === 'OPEN'),
      stats: {
        total: all.length, open: all.filter(t=>t.status==='OPEN').length,
        closed: closed.length, wins: wins.length, losses: losses.length,
        winRate, avgWin, avgLoss, expectancy,
        maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
        maxWinStreak, maxLossStreak,
      },
      byStrategy,
      monthly,
      analytics: {
        byHour:   hourStats,
        byDay:    dayStats,
        equity,
      },
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

    const { stop_loss: newSL } = req.body
    const updates = { monitored_at: new Date().toISOString() }
    if (status)      updates.status      = status
    if (exit_price)  updates.exit_price  = parseFloat(exit_price)
    if (exit_reason) updates.exit_reason = exit_reason
    if (pnl_points !== undefined) updates.pnl_points = parseFloat(pnl_points)
    if (pnl_pct !== undefined)    updates.pnl_pct    = parseFloat(pnl_pct)
    if (newSL !== undefined)      updates.stop_loss   = parseFloat(newSL)  // trailing SL update
    if (['WIN','LOSS','EXPIRED','CLOSED'].includes(status)) {
      updates.closed_at = new Date().toISOString()
    }

    const { error } = await sb.from('paper_trades').update(updates).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ updated: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
