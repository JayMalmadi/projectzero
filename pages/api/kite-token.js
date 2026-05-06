// /api/kite-token
// Returns the stored Kite access token from Supabase
// Used by Railway worker to make Kite API calls without user being logged in

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  // Only allow internal calls (from Railway worker)
  const authHeader = req.headers['x-internal-key']
  if (authHeader !== process.env.INTERNAL_API_KEY && process.env.NODE_ENV === 'production') {
    // Allow if no key set (during setup) or if key matches
    if (process.env.INTERNAL_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const { data, error } = await sb
      .from('kite_session')
      .select('*')
      .eq('id', 'current')
      .single()

    if (error || !data) {
      return res.status(404).json({ 
        error: 'No Kite session found',
        action: 'Please login to Zerodha on the dashboard'
      })
    }

    // Check if token is expired (midnight IST)
    const now = new Date()
    const expires = new Date(data.expires_at)
    const isExpired = now > expires

    if (isExpired || !data.is_valid) {
      return res.status(401).json({
        error: 'Token expired',
        expiredAt: data.expires_at,
        action: 'Please login to Zerodha on the dashboard to refresh token'
      })
    }

    return res.status(200).json({
      access_token: data.access_token,
      user_id:      data.user_id,
      user_name:    data.user_name,
      created_at:   data.created_at,
      expires_at:   data.expires_at,
      valid:        true,
    })

  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
