// /api/kite-trades
// Pulls real trade history from Zerodha Kite
// Returns today's trades + P&L from actual executed orders

export default async function handler(req, res) {
  const accessToken = req.headers['x-kite-access-token']
  const apiKey      = process.env.KITE_API_KEY

  if (!accessToken || !apiKey) {
    return res.status(401).json({ error: 'Not authenticated. Connect Zerodha first.' })
  }

  const AUTH    = `token ${apiKey}:${accessToken}`
  const HEADERS = { 'X-Kite-Version': '3', 'Authorization': AUTH }
  const BASE    = 'https://api.kite.trade'

  try {
    // Fetch all 3 in parallel: trades (executed), orders (all), positions
    const [tradesR, ordersR, positionsR] = await Promise.all([
      fetch(`${BASE}/trades`, { headers: HEADERS }),
      fetch(`${BASE}/orders`, { headers: HEADERS }),
      fetch(`${BASE}/portfolio/positions`, { headers: HEADERS }),
    ])

    const [tradesD, ordersD, positionsD] = await Promise.all([
      tradesR.json(),
      ordersR.json(),
      positionsR.json(),
    ])

    // Trades = actual filled executions today
    const trades = (tradesD.data || []).map(t => ({
      id:           t.trade_id,
      orderId:      t.order_id,
      symbol:       t.tradingsymbol,
      exchange:     t.exchange,
      direction:    t.transaction_type, // BUY or SELL
      quantity:     t.quantity,
      price:        t.average_price,
      value:        t.quantity * t.average_price,
      product:      t.product,
      orderType:    t.order_type,
      filledAt:     t.fill_timestamp,
      source:       'zerodha',
      market:       'india',
    }))

    // Orders = all orders today with status
    const orders = (ordersD.data || []).map(o => ({
      id:           o.order_id,
      symbol:       o.tradingsymbol,
      direction:    o.transaction_type,
      quantity:     o.quantity,
      price:        o.price || o.average_price,
      status:       o.status, // COMPLETE, REJECTED, CANCELLED, OPEN, etc.
      orderType:    o.order_type,
      product:      o.product,
      placedAt:     o.order_timestamp,
      statusMsg:    o.status_message,
      tag:          o.tag,
      source:       'zerodha',
    }))

    // Net positions = open positions
    const netPositions = (positionsD.data?.net || [])
      .filter(p => p.quantity !== 0)
      .map(p => ({
        symbol:       p.tradingsymbol,
        exchange:     p.exchange,
        quantity:     p.quantity,
        avgPrice:     p.average_price,
        ltp:          p.last_price,
        pnl:          p.pnl,
        value:        p.value,
        product:      p.product,
      }))

    // Calculate today's P&L from completed trades
    // Match BUY-SELL pairs
    const symbolTrades = {}
    for (const t of trades) {
      if (!symbolTrades[t.symbol]) symbolTrades[t.symbol] = { buys: [], sells: [] }
      if (t.direction === 'BUY') symbolTrades[t.symbol].buys.push(t)
      else symbolTrades[t.symbol].sells.push(t)
    }

    let totalPnL = 0
    const pnlBySymbol = {}
    for (const [sym, {buys, sells}] of Object.entries(symbolTrades)) {
      const avgBuy  = buys.length  ? buys.reduce((a,t)=>a+t.price*t.quantity,0)  / buys.reduce((a,t)=>a+t.quantity,0)  : 0
      const avgSell = sells.length ? sells.reduce((a,t)=>a+t.price*t.quantity,0) / sells.reduce((a,t)=>a+t.quantity,0) : 0
      const qty = Math.min(
        buys.reduce((a,t)=>a+t.quantity,0),
        sells.reduce((a,t)=>a+t.quantity,0)
      )
      const pnl = qty > 0 ? (avgSell - avgBuy) * qty : 0
      pnlBySymbol[sym] = parseFloat(pnl.toFixed(2))
      totalPnL += pnl
    }

    // Add P&L from open positions (unrealised)
    const unrealisedPnL = netPositions.reduce((a, p) => a + (p.pnl || 0), 0)

    return res.status(200).json({
      status:       'success',
      source:       'zerodha',
      trades,           // today's executions
      orders,           // all orders today
      positions:    netPositions,
      summary: {
        tradesCount:   trades.length,
        ordersCount:   orders.length,
        positionsOpen: netPositions.length,
        realisedPnL:   parseFloat(totalPnL.toFixed(2)),
        unrealisedPnL: parseFloat(unrealisedPnL.toFixed(2)),
        totalPnL:      parseFloat((totalPnL + unrealisedPnL).toFixed(2)),
        pnlBySymbol,
      }
    })

  } catch (err) {
    console.error('kite-trades error:', err)
    return res.status(500).json({ error: err.message })
  }
}
