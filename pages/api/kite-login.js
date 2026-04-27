// pages/api/kite-login.js
// Returns the Zerodha login URL for the frontend to redirect to

export default function handler(req, res) {
  const apiKey   = process.env.KITE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })
  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`
  return res.status(200).json({ loginUrl, apiKey })
}
