// /api/strategy-performance
// Calculates win rate, avg P&L, best/worst trade per strategy from trade history

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  try {
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'CLOSED')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    // Group by strategy
    const byStrategy = {}
    for (const t of trades || []) {
      const key = t.strategy || 'Unknown'
      if (!byStrategy[key]) byStrategy[key] = []
      byStrategy[key].push(t)
    }

    // Calculate stats per strategy
    const stats = Object.entries(byStrategy).map(([strategy, trades]) => {
      const pnls    = trades.map(t => parseFloat(t.pnl || 0))
      const wins    = pnls.filter(p => p > 0).length
      const losses  = pnls.filter(p => p <= 0).length
      const totalPnl = pnls.reduce((a, b) => a + b, 0)
      const avgPnl   = pnls.length > 0 ? totalPnl / pnls.length : 0
      const bestTrade = Math.max(...pnls, 0)
      const worstTrade= Math.min(...pnls, 0)
      const winRate  = trades.length > 0 ? ((wins / trades.length) * 100) : 0
      const profitFactor = losses > 0
        ? Math.abs(pnls.filter(p=>p>0).reduce((a,b)=>a+b,0) / pnls.filter(p=>p<=0).reduce((a,b)=>a+b,1))
        : wins > 0 ? 999 : 0

      return {
        strategy,
        trades:       trades.length,
        wins,
        losses,
        winRate:      parseFloat(winRate.toFixed(1)),
        totalPnl:     parseFloat(totalPnl.toFixed(2)),
        avgPnl:       parseFloat(avgPnl.toFixed(2)),
        bestTrade:    parseFloat(bestTrade.toFixed(2)),
        worstTrade:   parseFloat(worstTrade.toFixed(2)),
        profitFactor: parseFloat(profitFactor.toFixed(2)),
        lastTrade:    trades[0]?.created_at,
      }
    }).sort((a, b) => b.totalPnl - a.totalPnl)

    // Overall stats
    const allPnls    = (trades || []).map(t => parseFloat(t.pnl || 0))
    const totalTrades= allPnls.length
    const totalWins  = allPnls.filter(p => p > 0).length
    const totalPnl   = allPnls.reduce((a, b) => a + b, 0)
    const avgPnl     = totalTrades > 0 ? totalPnl / totalTrades : 0

    return res.status(200).json({
      status: 'success',
      overall: {
        totalTrades, totalWins,
        totalLosses: totalTrades - totalWins,
        winRate: totalTrades > 0 ? parseFloat(((totalWins/totalTrades)*100).toFixed(1)) : 0,
        totalPnl:    parseFloat(totalPnl.toFixed(2)),
        avgPnl:      parseFloat(avgPnl.toFixed(2)),
      },
      byStrategy: stats,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
