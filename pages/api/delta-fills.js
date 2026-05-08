// /api/delta-fills
// Fetches actual executed trades (fills) from Delta Exchange
// Routes through Hetzner proxy (178.105.45.73) - fixed IP whitelisted on Delta

const PROXY_URL = process.env.DELTA_PROXY_URL || 'http://178.105.45.73'

export default async function handler(req, res) {
  const { page_size = 100, page_num = 1 } = req.query

  try {
    const r = await fetch(`${PROXY_URL}/delta-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: `/v2/fills?page_size=${page_size}&page_num=${page_num}`,
        method: 'GET',
      }),
    })
    const d = await r.json()
    if (!d.success) {
      return res.status(400).json({ error: d.error || 'Delta API error' })
    }

    const fills = (d.result || []).map(f => ({
      id:          f.id,
      symbol:      f.product_symbol,
      side:        f.side,       // buy | sell
      size:        f.size,
      price:       parseFloat(f.price || 0),
      value:       parseFloat((f.size * f.price).toFixed(2)),
      fee:         parseFloat(f.commission || 0),
      pnl:         parseFloat(f.pnl || 0),
      orderId:     f.order_id,
      createdAt:   f.created_at,
      date:        f.created_at ? f.created_at.split('T')[0] : '',
    }))

    // Group by date for display
    const byDate = {}
    for (const fill of fills) {
      if (!byDate[fill.date]) byDate[fill.date] = []
      byDate[fill.date].push(fill)
    }

    return res.status(200).json({
      status:  'success',
      fills,
      byDate,
      total:   fills.length,
      meta:    d.meta || {},
    })
  } catch(err) {
    console.error('[DeltaFills] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
