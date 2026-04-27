// pages/api/binance.js
// Binance API integration for Projectzero
// Handles: live prices, account balance, place orders, trade history

import crypto from 'crypto'

const BASE = 'https://api.binance.com'
const SYMBOLS = {
  BTC:  'BTCUSDT',
  ETH:  'ETHUSDT',
  SOL:  'SOLUSDT',
  BNB:  'BNBUSDT',
  XRP:  'XRPUSDT',
  DOGE: 'DOGEUSDT',
  ADA:  'ADAUSDT',
}

// Sign request for private endpoints
function sign(params, secret) {
  const query = new URLSearchParams(params).toString()
  return crypto.createHmac('sha256', secret).update(query).digest('hex')
}

export default async function handler(req, res) {
  const { action } = req.query
  const apiKey    = req.headers['x-binance-api-key'] || process.env.BINANCE_API_KEY
  const apiSecret = req.headers['x-binance-api-secret'] || process.env.BINANCE_API_SECRET

  try {

    // ── PUBLIC: Live prices (no auth needed) ─────────────────────
    if (action === 'prices') {
      const syms = Object.values(SYMBOLS)
      const r    = await fetch(`${BASE}/api/v3/ticker/24hr?symbols=${JSON.stringify(syms)}`)
      const data = await r.json()

      if (!Array.isArray(data)) {
        return res.status(500).json({ error: 'Binance price fetch failed', details: data })
      }

      const prices = {}
      data.forEach(t => {
        const sym = Object.entries(SYMBOLS).find(([,v]) => v === t.symbol)?.[0]
        if (sym) {
          prices[sym] = {
            price:  parseFloat(t.lastPrice),
            change: parseFloat(t.priceChange),
            pct:    parseFloat(t.priceChangePercent),
            high:   parseFloat(t.highPrice),
            low:    parseFloat(t.lowPrice),
            volume: parseFloat(t.volume),
          }
        }
      })
      return res.status(200).json({ status: 'success', prices, source: 'binance' })
    }

    // ── PUBLIC: Candlestick/chart data ───────────────────────────
    if (action === 'candles') {
      const { symbol = 'BTC', interval = '15m', limit = 200 } = req.query
      const binanceSym = SYMBOLS[symbol] || `${symbol}USDT`

      // Map our intervals to Binance format
      const intervalMap = {
        '1minute':'1m','3minute':'3m','5minute':'5m','10minute':'15m',
        '15minute':'15m','30minute':'30m','60minute':'1h',
        'day':'1d','week':'1w',
        '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m',
        '1h':'1h','1d':'1d','1w':'1w',
      }
      const binanceInterval = intervalMap[interval] || '15m'

      const r    = await fetch(`${BASE}/api/v3/klines?symbol=${binanceSym}&interval=${binanceInterval}&limit=${limit}`)
      const data = await r.json()

      if (!Array.isArray(data)) {
        return res.status(500).json({ error: 'Candle fetch failed', details: data })
      }

      // Convert Binance kline format to our lightweight-charts format
      // [openTime, open, high, low, close, volume, ...]
      const candles = data.map(c => ({
        time:   Math.floor(parseInt(c[0]) / 1000),
        open:   parseFloat(c[1]),
        high:   parseFloat(c[2]),
        low:    parseFloat(c[3]),
        close:  parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }))

      const last = candles[candles.length - 1]
      return res.status(200).json({
        status: 'success', source: 'binance', symbol, interval: binanceInterval,
        candles, last
      })
    }

    // ── PRIVATE: Account balance ──────────────────────────────────
    if (action === 'account') {
      if (!apiKey || !apiSecret) {
        return res.status(401).json({ error: 'Binance API key required' })
      }
      const params = { timestamp: Date.now(), recvWindow: 5000 }
      params.signature = sign(params, apiSecret)
      const r = await fetch(`${BASE}/api/v3/account?${new URLSearchParams(params)}`, {
        headers: { 'X-MBX-APIKEY': apiKey }
      })
      const data = await r.json()
      if (data.code) return res.status(400).json({ error: data.msg })

      // Filter to non-zero balances + key coins
      const KEY_COINS = ['USDT','BTC','ETH','SOL','BNB','XRP','DOGE','ADA','BUSD']
      const balances  = (data.balances || []).filter(b =>
        parseFloat(b.free) > 0 || parseFloat(b.locked) > 0 || KEY_COINS.includes(b.asset)
      ).map(b => ({
        asset:  b.asset,
        free:   parseFloat(b.free),
        locked: parseFloat(b.locked),
        total:  parseFloat(b.free) + parseFloat(b.locked),
      }))
      return res.status(200).json({ status: 'success', balances, canTrade: data.canTrade })
    }

    // ── PRIVATE: Open orders ──────────────────────────────────────
    if (action === 'open_orders') {
      if (!apiKey || !apiSecret) return res.status(401).json({ error: 'Auth required' })
      const params = { timestamp: Date.now(), recvWindow: 5000 }
      params.signature = sign(params, apiSecret)
      const r = await fetch(`${BASE}/api/v3/openOrders?${new URLSearchParams(params)}`, {
        headers: { 'X-MBX-APIKEY': apiKey }
      })
      const data = await r.json()
      return res.status(200).json({ status: 'success', orders: data })
    }

    // ── PRIVATE: Place order ──────────────────────────────────────
    if (action === 'place_order' && req.method === 'POST') {
      if (!apiKey || !apiSecret) return res.status(401).json({ error: 'Auth required' })
      const {
        symbol,           // e.g. BTC
        side,             // BUY or SELL
        quantity,         // amount of crypto
        order_type = 'MARKET',
        price,            // for LIMIT orders
        stop_loss_price,
        take_profit_price,
      } = req.body

      const binanceSym = SYMBOLS[symbol] || `${symbol}USDT`
      const results = {}

      // 1. Place main order
      const mainParams = {
        symbol:    binanceSym,
        side,
        type:      order_type,
        quantity,
        timestamp: Date.now(),
        recvWindow: 5000,
        ...(order_type === 'LIMIT' ? { price, timeInForce: 'GTC' } : {}),
      }
      mainParams.signature = sign(mainParams, apiSecret)
      const mainRes = await fetch(`${BASE}/api/v3/order`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(mainParams).toString(),
      })
      const mainData = await mainRes.json()
      results.main_order = mainData
      results.main_order_id = mainData.orderId

      if (mainData.code) {
        return res.status(400).json({ error: mainData.msg, results })
      }

      // 2. Auto Stop Loss (STOP_LOSS_LIMIT)
      if (stop_loss_price && !mainData.code) {
        const slSide   = side === 'BUY' ? 'SELL' : 'BUY'
        const slParams = {
          symbol:       binanceSym,
          side:         slSide,
          type:         'STOP_LOSS_LIMIT',
          quantity,
          price:        stop_loss_price,
          stopPrice:    stop_loss_price,
          timeInForce:  'GTC',
          timestamp:    Date.now(),
          recvWindow:   5000,
        }
        slParams.signature = sign(slParams, apiSecret)
        const slRes  = await fetch(`${BASE}/api/v3/order`, {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(slParams).toString(),
        })
        results.sl_order    = await slRes.json()
        results.sl_order_id = results.sl_order?.orderId
      }

      // 3. Auto Take Profit (TAKE_PROFIT_LIMIT)
      if (take_profit_price && !mainData.code) {
        const tpSide   = side === 'BUY' ? 'SELL' : 'BUY'
        const tpParams = {
          symbol:       binanceSym,
          side:         tpSide,
          type:         'TAKE_PROFIT_LIMIT',
          quantity,
          price:        take_profit_price,
          stopPrice:    take_profit_price,
          timeInForce:  'GTC',
          timestamp:    Date.now(),
          recvWindow:   5000,
        }
        tpParams.signature = sign(tpParams, apiSecret)
        const tpRes  = await fetch(`${BASE}/api/v3/order`, {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tpParams).toString(),
        })
        results.tp_order    = await tpRes.json()
        results.tp_order_id = results.tp_order?.orderId
      }

      return res.status(200).json({
        status:  'success',
        message: `${side} ${symbol} placed${results.sl_order_id ? ' + SL' : ''}${results.tp_order_id ? ' + Target' : ''}`,
        results,
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error('Binance API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
