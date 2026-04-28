// /api/daily-reports — GET/POST daily reports history
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {

  // GET — fetch reports
  if (req.method === 'GET') {
    const { limit = 30, date } = req.query
    if (date) {
      const { data, error } = await sb.from('daily_reports').select('*').eq('report_date', date).single()
      if (error) return res.status(404).json({ error: 'Not found' })
      return res.status(200).json({ report: data })
    }
    const { data, error } = await sb
      .from('daily_reports')
      .select('report_date,morning_brief,daily_summary,trades_today,pnl_today,updated_at')
      .order('report_date', { ascending: false })
      .limit(parseInt(limit))
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ reports: data || [] })
  }

  // POST — save/update a report (called by Railway worker)
  if (req.method === 'POST') {
    const body = req.body || {}
    const report_date = body.report_date || new Date().toISOString().split('T')[0]

    // Upsert — merges with existing data for same date
    const { data, error } = await sb.from('daily_reports').upsert({
      report_date,
      ...(body.morning_brief   && { morning_brief:   body.morning_brief }),
      ...(body.india_analysis  && { india_analysis:  body.india_analysis }),
      ...(body.crypto_analysis && { crypto_analysis: body.crypto_analysis }),
      ...(body.daily_summary   && { daily_summary:   body.daily_summary }),
      ...(body.global_data     && { global_data:     body.global_data }),
      ...(body.key_signals     && { key_signals:     body.key_signals }),
      ...(body.trades_today != null && { trades_today: body.trades_today }),
      ...(body.pnl_today    != null && { pnl_today:    body.pnl_today }),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'report_date' })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ saved: true, report_date })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
