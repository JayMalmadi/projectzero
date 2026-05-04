// /api/myip — returns the server's outbound IP
// Used to find what IP Vercel uses for outbound requests
export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.ipify.org?format=json')
    const d = await r.json()
    return res.status(200).json({ 
      outboundIp: d.ip,
      incomingIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
      region: process.env.VERCEL_REGION || 'unknown',
    })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
