// pages/api/kite.js
// Proxies Zerodha Kite API calls to avoid CORS issues

export default async function handler(req, res) {
  const { endpoint, method = 'GET', body } = req.body || req.query
  const enctoken = req.headers['x-kite-token']

  if (!enctoken) {
    return res.status(401).json({ error: 'No Kite session token' })
  }

  const BASE = 'https://kite.zerodha.com/oms'
  const url  = `${BASE}${endpoint}`

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `enctoken ${enctoken}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'X-Kite-Version':'3',
      },
      body: method !== 'GET' && body
        ? new URLSearchParams(body).toString()
        : undefined,
    })

    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
