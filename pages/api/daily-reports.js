// /api/daily-reports — fetch saved daily reports history
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { limit = 30, date } = req.query

    if (date) {
      // Get specific date
      const { data, error } = await sb.from('daily_reports').select('*').eq('report_date', date).single()
      if (error) return res.status(404).json({ error: 'Report not found' })
      return res.status(200).json({ report: data })
    }

    // Get last N days
    const { data, error } = await sb
      .from('daily_reports')
      .select('report_date,morning_brief,daily_summary,trades_today,pnl_today,updated_at')
      .order('report_date', { ascending: false })
      .limit(parseInt(limit))

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ reports: data || [] })
  }

  return res.status(405).json({ error: 'GET only' })
}
