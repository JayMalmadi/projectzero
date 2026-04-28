// /api/signal-history — log and retrieve signal history
// Every BUY/SELL signal that fires gets auto-saved here
// This creates a track record of what the strategies produce

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {

  // GET — fetch signal history
  if (req.method === 'GET') {
    const { symbol, strategy, market, limit = 50, days = 7 } = req.query
    let query = sb.from('signal_history')
      .select('*')
      .order('fired_at', { ascending: false })
      .limit(parseInt(limit))

    if (symbol)   query = query.eq('symbol', symbol.toUpperCase())
    if (strategy) query = query.eq('strategy', strategy)
    if (market)   query = query.eq('market', market)

    // Filter to last N days
    const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString()
    query = query.gte('fired_at', since)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Aggregate stats
    const all = data || []
    const wins   = all.filter(s => s.outcome === 'WIN').length
    const losses = all.filter(s => s.outcome === 'LOSS').length
    const acted  = all.filter(s => s.acted_on).length

    return res.status(200).json({
      signals: all,
      stats: {
        total: all.length,
        buy:   all.filter(s => s.signal === 'BUY').length,
        sell:  all.filter(s => s.signal === 'SELL').length,
        acted, wins, losses,
        winRate: wins + losses > 0 ? `${((wins/(wins+losses))*100).toFixed(0)}%` : 'N/A',
        avgConfidence: all.length > 0 ? (all.reduce((a,s) => a+(s.confidence||0),0)/all.length).toFixed(0) : 0,
      }
    })
  }

  // POST — log a new signal
  if (req.method === 'POST') {
    const { symbol, strategy, signal, confidence, price, stopLoss, target, rr, rsi, market, reason } = req.body
    if (!symbol || !strategy || !signal) return res.status(400).json({ error: 'symbol, strategy, signal required' })
    if (!['BUY','SELL'].includes(signal)) return res.status(400).json({ error: 'signal must be BUY or SELL' })

    // Avoid duplicate logs — don't log same signal twice within 1 hour
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    const { data: existing } = await sb.from('signal_history')
      .select('id')
      .eq('symbol', symbol.toUpperCase())
      .eq('strategy', strategy)
      .eq('signal', signal)
      .gte('fired_at', oneHourAgo)
      .limit(1)

    if (existing && existing.length > 0) {
      return res.status(200).json({ logged: false, reason: 'duplicate within 1h' })
    }

    const { data, error } = await sb.from('signal_history').insert([{
      symbol: symbol.toUpperCase(), strategy, signal,
      confidence: confidence || 0,
      price: parseFloat(price || 0),
      stop_loss: parseFloat(stopLoss || 0),
      target: parseFloat(target || 0),
      rr: parseFloat(rr || 0),
      rsi: parseFloat(rsi || 0),
      market: market || 'india',
      reason: reason || '',
      fired_at: new Date().toISOString(),
    }]).select()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ logged: true, signal: data[0] })
  }

  // PATCH — mark a signal as acted on or update outcome
  if (req.method === 'PATCH') {
    const { id, acted_on, outcome } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    const updates = {}
    if (acted_on !== undefined) updates.acted_on = acted_on
    if (outcome)                updates.outcome  = outcome

    const { error } = await sb.from('signal_history').update(updates).eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ updated: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
