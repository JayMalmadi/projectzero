// /api/strategies — Strategy registry CRUD + state management
// GET    → list all strategies with current state and recent paper trade stats
// POST   → create a new strategy
// PATCH  → update an existing strategy
// DELETE → remove a strategy (soft delete via enabled=false preferred)

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (req.method === 'GET') {
      // Fetch all strategies
      const { data: strategies, error } = await sb
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch current state for each
      const { data: states } = await sb.from('strategy_state').select('*')
      const stateMap = {}
      for (const s of (states || [])) stateMap[s.strategy_id] = s

      // Fetch paper trade stats — match by market + symbol + timeframe extracted from signal_type
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data: trades } = await sb
        .from('paper_trades')
        .select('strategy, status, pnl_pct, signal_type, symbol, market')
        .gte('opened_at', since)

      // Compute strategy_id for each trade based on its attributes
      function tradeToStrategyId(t) {
        if (!t.signal_type?.includes('tradingview')) return null
        // Skip option sub-trades — they share parent strategy stats via the futures trade
        if (t.signal_type.includes('option')) return null
        const tf = (t.signal_type.match(/_(\d+)m/) || [])[1] || '15'
        const mkt = (t.market === 'crypto' || t.market === 'delta') ? 'crypto' : 'india'
        if (mkt === 'india' && t.symbol === 'NIFTY')      return 'tv_nifty_' + tf + 'm'
        if (mkt === 'india' && t.symbol === 'BANKNIFTY')  return 'tv_banknifty_' + tf + 'm'
        if (mkt === 'india' && t.symbol === 'FINNIFTY')   return 'tv_finnifty_' + tf + 'm'
        if (mkt === 'crypto' && t.symbol === 'BTC')       return 'tv_btc_' + tf + 'm'
        if (mkt === 'crypto' && t.symbol === 'ETH')       return 'tv_eth_' + tf + 'm'
        return null
      }

      const tradeStats = {}
      for (const t of (trades || [])) {
        const sid = tradeToStrategyId(t)
        if (!sid) continue
        if (!tradeStats[sid]) tradeStats[sid] = { total: 0, wins: 0, losses: 0, open: 0, totalPnl: 0 }
        tradeStats[sid].total++
        if (t.status === 'WIN')   { tradeStats[sid].wins++;   tradeStats[sid].totalPnl += (t.pnl_pct || 0) }
        if (t.status === 'LOSS')  { tradeStats[sid].losses++; tradeStats[sid].totalPnl += (t.pnl_pct || 0) }
        if (t.status === 'OPEN')  tradeStats[sid].open++
      }

      const enriched = strategies.map(s => {
        const st = stateMap[s.id] || {}
        const stats = tradeStats[s.id] || { total: 0, wins: 0, losses: 0, open: 0, totalPnl: 0 }
        const closed = stats.wins + stats.losses
        return {
          ...s,
          state: {
            trades_today:    st.trades_today || 0,
            pnl_today_pct:   parseFloat(st.pnl_today_pct || 0),
            consec_losses:   st.consec_losses || 0,
            paused_until:    st.paused_until || null,
            pause_reason:    st.pause_reason || null,
          },
          stats_30d: {
            total:    stats.total,
            open:     stats.open,
            closed,
            wins:     stats.wins,
            losses:   stats.losses,
            win_rate: closed > 0 ? Math.round(stats.wins / closed * 100) : null,
            pnl_pct:  parseFloat((stats.totalPnl).toFixed(2)),
          }
        }
      })

      return res.status(200).json({ status: 'success', strategies: enriched })
    }

    if (req.method === 'POST') {
      const body = req.body
      if (!body.id || !body.name || !body.market) {
        return res.status(400).json({ error: 'Missing required fields: id, name, market' })
      }

      const { data, error } = await sb
        .from('strategies')
        .insert({ ...body, updated_at: new Date().toISOString() })
        .select()
        .single()

      if (error) throw error

      // Initialize state row
      await sb.from('strategy_state').insert({ strategy_id: data.id })

      return res.status(200).json({ status: 'success', strategy: data })
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })

      const { data, error } = await sb
        .from('strategies')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return res.status(200).json({ status: 'success', strategy: data })
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id required' })

      // Soft delete by disabling
      await sb.from('strategies').update({ enabled: false }).eq('id', id)
      return res.status(200).json({ status: 'success', disabled: id })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (e) {
    console.error('[strategies]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
