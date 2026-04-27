// pages/api/kite-pro.js
// Full Kite Connect proxy using proper access_token
// Handles: quotes, positions, orders, holdings, place order with SL

export default async function handler(req, res) {
  const accessToken = req.headers['x-kite-access-token']
  const apiKey      = process.env.KITE_API_KEY

  if (!accessToken || !apiKey) {
    return res.status(401).json({ error: 'Not authenticated. Please connect Zerodha.' })
  }

  const AUTH    = `token ${apiKey}:${accessToken}`
  const HEADERS = { 'X-Kite-Version': '3', 'Authorization': AUTH }
  const BASE    = 'https://api.kite.trade'

  const { action } = req.query

  try {
    // ── GET PROFILE ──────────────────────────────────
    if (action === 'profile') {
      const r = await fetch(`${BASE}/user/profile`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET FUNDS/MARGINS ─────────────────────────────
    if (action === 'funds') {
      const r = await fetch(`${BASE}/user/margins`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET POSITIONS ─────────────────────────────────
    if (action === 'positions') {
      const r = await fetch(`${BASE}/portfolio/positions`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET HOLDINGS ──────────────────────────────────
    if (action === 'holdings') {
      const r = await fetch(`${BASE}/portfolio/holdings`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET ORDERS ────────────────────────────────────
    if (action === 'orders') {
      const r = await fetch(`${BASE}/orders`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET LIVE QUOTES ───────────────────────────────
    if (action === 'quote') {
      const { instruments } = req.query
      // e.g. instruments=NSE:NIFTY+50,NSE:BANKNIFTY
      const params = new URLSearchParams()
      const syms   = (instruments || 'NSE:NIFTY 50,NSE:NIFTY BANK').split(',')
      syms.forEach(s => params.append('i', s))
      const r = await fetch(`${BASE}/quote?${params}`, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET HISTORICAL DATA (for charts) ─────────────
    if (action === 'historical') {
      const { instrument_token, interval, from, to } = req.query
      const url = `${BASE}/instruments/historical/${instrument_token}/${interval}?from=${from}&to=${to}&continuous=0`
      const r = await fetch(url, { headers: HEADERS })
      return res.status(r.status).json(await r.json())
    }

    // ── GET INSTRUMENTS (for token lookup) ────────────
    if (action === 'instruments') {
      const { exchange = 'NSE' } = req.query
      const r = await fetch(`${BASE}/instruments/${exchange}`, { headers: HEADERS })
      const text = await r.text()
      // Parse CSV
      const lines  = text.trim().split('\n')
      const header = lines[0].split(',')
      const rows   = lines.slice(1).map(l => {
        const vals = l.split(',')
        return Object.fromEntries(header.map((h, i) => [h.trim(), vals[i]?.trim()]))
      })
      // Filter to key symbols only
      const keySymbols = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'TCS', 'INFY', 'ICICIBANK', 'RELIANCE', 'HDFCBANK', 'SBIN', 'WIPRO']
      const filtered = rows.filter(r => keySymbols.includes(r.tradingsymbol) || keySymbols.includes(r.name))
      return res.status(200).json({ status: 'success', data: filtered.slice(0, 50) })
    }

    // ── PLACE ORDER + AUTO STOP LOSS ─────────────────
    if (action === 'place_order' && req.method === 'POST') {
      const {
        tradingsymbol, exchange = 'NSE',
        transaction_type,          // BUY or SELL
        quantity, product = 'MIS',
        order_type = 'MARKET',
        price,                     // for LIMIT orders
        stop_loss_price,           // auto-place SL order
        target_price,              // auto-place target order
        validity = 'DAY',
      } = req.body

      const results = {}

      // 1. Place main order
      const mainBody = new URLSearchParams({
        tradingsymbol, exchange, transaction_type,
        quantity, product, order_type, validity,
        ...(order_type === 'LIMIT' && price ? { price } : {}),
      })

      const mainRes  = await fetch(`${BASE}/orders/regular`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: mainBody.toString(),
      })
      const mainData = await mainRes.json()
      results.main_order = mainData

      if (mainData.status !== 'success') {
        return res.status(400).json({ error: 'Main order failed', details: mainData, results })
      }

      results.main_order_id = mainData.data?.order_id

      // 2. Auto-place Stop Loss order (opposite direction, SL-M type)
      if (stop_loss_price && mainData.status === 'success') {
        const sl_direction = transaction_type === 'BUY' ? 'SELL' : 'BUY'
        const slBody = new URLSearchParams({
          tradingsymbol, exchange,
          transaction_type: sl_direction,
          quantity, product,
          order_type: 'SL-M',           // Stop Loss Market
          trigger_price: stop_loss_price,
          validity,
        })
        const slRes  = await fetch(`${BASE}/orders/regular`, {
          method: 'POST',
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: slBody.toString(),
        })
        results.sl_order = await slRes.json()
        results.sl_order_id = results.sl_order?.data?.order_id
      }

      // 3. Auto-place Target/Profit order (LIMIT, opposite direction)
      if (target_price && mainData.status === 'success') {
        const tgt_direction = transaction_type === 'BUY' ? 'SELL' : 'BUY'
        const tgtBody = new URLSearchParams({
          tradingsymbol, exchange,
          transaction_type: tgt_direction,
          quantity, product,
          order_type: 'LIMIT',
          price: target_price,
          validity,
        })
        const tgtRes  = await fetch(`${BASE}/orders/regular`, {
          method: 'POST',
          headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tgtBody.toString(),
        })
        results.target_order = await tgtRes.json()
        results.target_order_id = results.target_order?.data?.order_id
      }

      return res.status(200).json({
        status: 'success',
        message: `Order placed${results.sl_order_id ? ' + SL' : ''}${results.target_order_id ? ' + Target' : ''}`,
        results,
      })
    }

    // ── CANCEL ORDER ──────────────────────────────────
    if (action === 'cancel_order' && req.method === 'DELETE') {
      const { order_id } = req.query
      const r = await fetch(`${BASE}/orders/regular/${order_id}`, {
        method: 'DELETE', headers: HEADERS
      })
      return res.status(r.status).json(await r.json())
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('Kite Pro error:', err)
    return res.status(500).json({ error: err.message })
  }
}
