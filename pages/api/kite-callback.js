// pages/api/kite-callback.js
// Zerodha redirects here after login with ?request_token=xxx
// We exchange it for an access_token and store in Supabase

import crypto from 'crypto'

export default async function handler(req, res) {
  const { request_token, status, action } = req.query

  // Handle logout action
  if (action === 'logout') {
    const html = `<!DOCTYPE html><html><head><title>Logged Out</title></head><body>
    <script>
      localStorage.removeItem('kite_access_token')
      localStorage.removeItem('kite_user')
      window.location.href = '/dashboard'
    </script>
    </body></html>`
    return res.status(200).send(html)
  }

  if (status !== 'success' || !request_token) {
    return res.redirect('/?error=kite_login_failed')
  }

  try {
    const apiKey    = process.env.KITE_API_KEY
    const apiSecret = process.env.KITE_API_SECRET

    // Generate checksum: SHA256(api_key + request_token + api_secret)
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + request_token + apiSecret)
      .digest('hex')

    // Exchange request_token for access_token
    const tokenRes = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token,
        checksum,
      }).toString(),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.status !== 'success') {
      console.error('Token exchange failed:', tokenData)
      return res.redirect('/dashboard?error=token_exchange_failed')
    }

    const { access_token, user_id, user_name, email, exchanges, products } = tokenData.data

    // Save token to Supabase so Railway worker can use it throughout the day
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const midnight = new Date()
      midnight.setHours(23, 59, 59, 0)
      await sb.from('kite_session').upsert({
        id: 'current',
        access_token,
        user_id,
        user_name,
        created_at: new Date().toISOString(),
        expires_at: midnight.toISOString(),
        is_valid: true,
      }, { onConflict: 'id' })
      console.log('Kite token saved to Supabase for worker use')
    } catch(e) {
      console.error('Failed to save token to Supabase:', e.message)
      // Don't block login if Supabase save fails
    }

    // Pass token to frontend via HTML page that stores in localStorage
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Connecting to Zerodha...</title>
  <style>
    body { background: #0a0e1a; color: #e2e8f0; font-family: 'Space Grotesk', sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; flex-direction: column; gap: 16px; }
    .loader { width: 40px; height: 40px; border: 3px solid #1e2d4a; border-top-color: #00d4ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="loader"></div>
  <p>Connected! Redirecting to dashboard...</p>
  <script>
    localStorage.setItem('kite_access_token', '${access_token}')
    localStorage.setItem('kite_user', JSON.stringify({
      user_id: '${user_id}',
      user_name: '${user_name}',
      email: '${email}',
      connected_at: new Date().toISOString()
    }))
    localStorage.setItem('kite_connected_date', new Date().toDateString())
    setTimeout(() => { window.location.href = '/dashboard' }, 1000)
  </script>
</body>
</html>`

    return res.status(200).send(html)

  } catch (err) {
    console.error('Kite callback error:', err)
    return res.redirect('/dashboard?error=server_error')
  }
}
