// /api/delta
// Delta Exchange India — Perpetual Futures Trading
// Docs: https://docs.delta.exchange
// Base: https://api.india.delta.exchange

import crypto from 'crypto'

const BASE = 'https://api.india.delta.exchange'

// Product IDs for perpetual futures (Delta India)
const PRODUCTS = {
  BTC:  { id: 27,    symbol: 'BTCUSD', contractValue: 0.001, tickSize: 0.5,    initMargin: 0.5  },
  ETH:  { id: 3136,  symbol: 'ETHUSD', contractValue: 0.01,  tickSize: 0.05,   initMargin: 1.0  },
  SOL:  { id: 14823, symbol: 'SOLUSD', contractValue: 1.0,   tickSize: 0.0001, initMargin: 2.0  },
  XRP:  { id: 14969, symbol: 'XRPUSD', contractValue: 1.0,   tickSize: 0.0001, initMargin: 2.0  },
  BNB:  { id: 15042, symbol: 'BNBUSD', contractValue: 0.1,   tickSize: 0.001,  initMargin: 2.0  },
}

// HMAC SHA256 signature for Delta Exchange auth
function sign(secret, method, timestamp, path, body = '') {
  const msg = method + timestamp + path + body
  return crypto.createHmac('sha256', secret).update(msg).digest('hex')
}

// Authenticated request — routes through Hetzner (fixed IP 178.105.45.73) for Delta whitelist
const HETZNER_PROXY = process.env.DELTA_PROXY_URL || 'http://178.105.45.73'

async function deltaRequest(apiKey, apiSecret, method, path, bodyObj = null) {
  // Use Hetzner proxy so requests come from fixed whitelisted IP 178.105.45.73
  const r = await fetch(`${HETZNER_PROXY}/delta-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method, payload: bodyObj || undefined }),
  })
  if (!r.ok) {
    const txt = await r.text()
    console.error('Railway proxy error:', r.status, txt.slice(0,200))
    throw new Error(`Railway proxy: ${r.status}`)
  }
  return r.json()
}

// Round price to nearest tick size
function roundToTick(price, tickSize) {
  return Math.round(price / tickSize) * tickSize
}

export default async function handler(req, res) {
  const { action } = req.query
  const apiKey    = process.env.DELTA_API_KEY
  const apiSecret = process.env.DELTA_API_SECRET

  try {

    // ── DEBUG: Check keys loaded (remove in production) ────────
    if (action === 'debug') {
      return res.status(200).json({
        hasKey:    !!apiKey,
        hasSecret: !!apiSecret,
        keyPrefix: apiKey ? apiKey.slice(0,6) + '...' : 'MISSING',
        secretPrefix: apiSecret ? apiSecret.slice(0,6) + '...' : 'MISSING',
        env_check: process.env.DELTA_API_KEY ? 'key_found' : 'key_missing',
      })
    }

    // ── PUBLIC: Live prices (no auth) ───────────────────────────
    if (action === 'prices') {
      const r = await fetch(`${BASE}/v2/tickers?contract_types=perpetual_futures`, {
        headers: { 'User-Agent': 'projectzero/1.0' }
      })
      const d = await r.json()
      const tickers = d.result || []

      const prices = {}
      Object.entries(PRODUCTS).forEach(([sym, prod]) => {
        const t = tickers.find(t => t.symbol === prod.symbol)
        if (t) {
          prices[sym] = {
            symbol:     prod.symbol,
            price:      parseFloat(t.mark_price || t.close || 0),
            change:     parseFloat(t.price_change_24h || 0),
            pct:        parseFloat(t.price_change_24h_percentage || 0),
            high:       parseFloat(t.high || 0),
            low:        parseFloat(t.low || 0),
            volume:     parseFloat(t.volume || 0),
            oi:         parseFloat(t.oi_value_usd || 0),
            fundingRate:parseFloat(t.funding_rate || 0),
            productId:  prod.id,
            contractValue: prod.contractValue,
          }
        }
      })
      return res.status(200).json({ status: 'success', prices, source: 'delta' })
    }

    // ── PUBLIC: Orderbook / market depth ────────────────────────
    if (action === 'orderbook') {
      const { symbol = 'BTCUSD' } = req.query
      const r = await fetch(`${BASE}/v2/l2orderbook/${symbol}?depth=10`)
      const d = await r.json()
      return res.status(200).json({ status: 'success', orderbook: d.result })
    }

    // ── PUBLIC: Candlestick/OHLCV data ───────────────────────────
    if (action === 'candles') {
      const { symbol = 'BTCUSD', resolution = '15m', limit = 300 } = req.query

      // Valid Delta resolutions: 1m,3m,5m,15m,30m,1h,2h,4h,6h,12h,1d,1w
      // Map common aliases to Delta format
      const resMap = {
        '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
        '60':'1h','1h':'1h','2h':'2h','4h':'4h',
        '1d':'1d','1D':'1d','D':'1d','1w':'1w','W':'1w',
      }
      const deltaRes = resMap[resolution] || resolution

      // Calculate start time based on resolution and limit
      const resSeconds = {
        '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
        '1h':3600,'2h':7200,'4h':14400,'6h':21600,'12h':43200,
        '1d':86400,'1w':604800,
      }
      const end   = Math.floor(Date.now() / 1000)
      const resSec = resSeconds[deltaRes] || 900
      const start = end - (parseInt(limit) * resSec)

      const r = await fetch(
        `${BASE}/v2/history/candles?symbol=${symbol}&resolution=${deltaRes}&start=${start}&end=${end}`,
        { headers: { 'User-Agent': 'projectzero/1.0' } }
      )
      const d = await r.json()
      // Delta returns newest first — sort to oldest first for charts
      const candles = (d.result || [])
        .map(c => ({
          time:   c.time,
          open:   parseFloat(c.open),
          high:   parseFloat(c.high),
          low:    parseFloat(c.low),
          close:  parseFloat(c.close),
          volume: parseFloat(c.volume || 0),
        }))
        .sort((a, b) => a.time - b.time)

      return res.status(200).json({ status: 'success', candles, symbol, resolution: deltaRes })
    }

    // Auth required below this point
    if (!apiKey || !apiSecret) {
      return res.status(401).json({ error: 'Delta API keys not configured. Add DELTA_API_KEY and DELTA_API_SECRET to Vercel.' })
    }

    // ── PRIVATE: Wallet balance ───────────────────────────────────
    if (action === 'wallet') {
      const d = await deltaRequest(apiKey, apiSecret, 'GET', '/v2/wallet/balances')
      if (d.error) return res.status(400).json({ error: d.error?.message || d.error })

      const balances = (d.result || []).map(b => ({
        asset:            b.asset_symbol,
        balance:          parseFloat(b.balance || 0),
        availableBalance: parseFloat(b.available_balance || 0),
        unrealizedPnL:    parseFloat(b.unrealized_pnl || 0),
        positionMargin:   parseFloat(b.position_margin || 0),
        orderMargin:      parseFloat(b.order_margin || 0),
      })).filter(b => b.balance > 0 || ['USD','USDT','INR'].includes(b.asset))

      const total = balances.reduce((sum, b) => sum + b.availableBalance, 0)
      return res.status(200).json({ status: 'success', balances, totalUSD: total })
    }

    // ── PRIVATE: Open positions ───────────────────────────────────
    if (action === 'positions') {
      const d = await deltaRequest(apiKey, apiSecret, 'GET', '/v2/positions/margined')
      if (d.error) return res.status(400).json({ error: d.error?.message || d.error })

      const positions = (d.result || [])
        .filter(p => parseFloat(p.size) !== 0)
        .map(p => ({
          symbol:       p.product?.symbol || p.product_symbol,
          productId:    p.product_id,
          side:         parseFloat(p.size) > 0 ? 'BUY' : 'SELL',
          size:         Math.abs(parseFloat(p.size)),
          entryPrice:   parseFloat(p.entry_price || 0),
          markPrice:    parseFloat(p.mark_price || 0),
          liquidationPrice: parseFloat(p.liquidation_price || 0),
          unrealizedPnL: parseFloat(p.unrealized_pnl || 0),
          realizedPnL:  parseFloat(p.realized_pnl || 0),
          margin:       parseFloat(p.margin || 0),
          leverage:     parseFloat(p.leverage || 0),
        }))

      return res.status(200).json({ status: 'success', positions })
    }

    // ── PRIVATE: Open orders ──────────────────────────────────────
    if (action === 'orders') {
      const { product_id } = req.query
      const path = product_id
        ? `/v2/orders?product_ids=${product_id}&states=open`
        : '/v2/orders?states=open'
      const d = await deltaRequest(apiKey, apiSecret, 'GET', path)
      if (d.error) return res.status(400).json({ error: d.error?.message || d.error })
      return res.status(200).json({ status: 'success', orders: d.result || [] })
    }

    // ── PRIVATE: Place order with auto SL + Target ────────────────
    if (action === 'place_order' && req.method === 'POST') {
      const {
        symbol,           // BTC, ETH, SOL, XRP, BNB
        side,             // BUY or SELL
        size,             // number of contracts
        orderType = 'market_order',
        limitPrice,       // for limit orders
        stopLossPrice,    // auto SL bracket order
        takeProfitPrice,  // auto TP bracket order
        leverage,         // optional: set leverage
      } = req.body

      const product = PRODUCTS[symbol.toUpperCase()]
      if (!product) return res.status(400).json({ error: `Unknown symbol: ${symbol}. Use BTC, ETH, SOL, XRP, BNB` })

      const results = {}

      // Set leverage if specified
      if (leverage) {
        const levPath = `/v2/products/${product.id}/orders/leverage`
        await deltaRequest(apiKey, apiSecret, 'POST', levPath, {
          product_id: product.id,
          leverage: leverage.toString(),
        }).catch(() => {})
      }

      // Place main order
      const orderBody = {
        product_id:   product.id,
        size:         parseInt(size),
        side:         side.toLowerCase(),
        order_type:   orderType,
        time_in_force:'gtc',
        ...(orderType === 'limit_order' && limitPrice
          ? { limit_price: roundToTick(limitPrice, parseFloat(product.tickSize)).toString() }
          : {}),
      }

      const mainD = await deltaRequest(apiKey, apiSecret, 'POST', '/v2/orders', orderBody)
      if (mainD.error || mainD.result?.error) {
        return res.status(400).json({
          error: mainD.error?.message || mainD.result?.error || 'Order failed',
          details: mainD,
        })
      }
      results.main = mainD.result
      results.orderId = mainD.result?.id

      // Place Stop Loss (bracket order)
      if (stopLossPrice && results.orderId) {
        const slSide  = side.toLowerCase() === 'buy' ? 'sell' : 'buy'
        const slPrice = roundToTick(stopLossPrice, parseFloat(product.tickSize))
        const slBody  = {
          product_id:    product.id,
          size:          parseInt(size),
          side:          slSide,
          order_type:    'stop_market_order',
          stop_price:    slPrice.toString(),
          time_in_force: 'gtc',
          stop_order_type: 'stop_loss_order',
          bracket_order:  true,
        }
        const slD = await deltaRequest(apiKey, apiSecret, 'POST', '/v2/orders', slBody)
        results.stopLoss = slD.result
        results.slOrderId = slD.result?.id
      }

      // Place Take Profit (bracket order)
      if (takeProfitPrice && results.orderId) {
        const tpSide  = side.toLowerCase() === 'buy' ? 'sell' : 'buy'
        const tpPrice = roundToTick(takeProfitPrice, parseFloat(product.tickSize))
        const tpBody  = {
          product_id:    product.id,
          size:          parseInt(size),
          side:          tpSide,
          order_type:    'take_profit_order',
          stop_price:    tpPrice.toString(),
          time_in_force: 'gtc',
          stop_order_type: 'take_profit_order',
          bracket_order:  true,
        }
        const tpD = await deltaRequest(apiKey, apiSecret, 'POST', '/v2/orders', tpBody)
        results.takeProfit = tpD.result
        results.tpOrderId  = tpD.result?.id
      }

      const legs = [
        'Main order',
        results.slOrderId ? '+ Stop Loss' : '',
        results.tpOrderId ? '+ Take Profit' : '',
      ].filter(Boolean).join(' ')

      return res.status(200).json({
        status:  'success',
        message: `${side} ${size} ${symbol} contracts on Delta Exchange — ${legs}`,
        results,
      })
    }

    // ── PRIVATE: Cancel order ────────────────────────────────────
    if (action === 'cancel_order' && req.method === 'DELETE') {
      const { order_id, product_id } = req.body
      const d = await deltaRequest(apiKey, apiSecret, 'DELETE', '/v2/orders', {
        id: order_id,
        product_id,
      })
      return res.status(200).json({ status: 'success', result: d.result })
    }

    // ── PRIVATE: Order history ────────────────────────────────────
    if (action === 'order_history') {
      const d = await deltaRequest(apiKey, apiSecret, 'GET', '/v2/orders/history?page_size=20')
      return res.status(200).json({ status: 'success', orders: d.result || [] })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('Delta Exchange error:', err)
    return res.status(500).json({ error: err.message })
  }
}
