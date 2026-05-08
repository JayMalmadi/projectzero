// /api/live-prices
// Unified live price feed for all 7 instruments
// India: NIFTY, BANKNIFTY, FINNIFTY (from Kite — requires daily login)
// Crypto: BTC, ETH, SOL, XRP (from Delta — no auth, always on)
// Single endpoint, one call, returns everything
// Designed for 1-2 second polling from dashboard

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const KITE_BASE  = 'https://api.kite.trade'
const DELTA_BASE = 'https://api.india.delta.exchange'
const API_KEY    = process.env.KITE_API_KEY

// Kite instrument identifiers for quotes
const INDIA_INSTRUMENTS = {
  NIFTY:     'NSE:NIFTY 50',
  BANKNIFTY: 'NSE:NIFTY BANK',
  FINNIFTY:  'NSE:NIFTY FIN SERVICE',
}

// Delta perpetual futures symbols
const CRYPTO_SYMBOLS = {
  BTC: 'BTCUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
}

// Get stored Kite access token
async function getKiteToken(headerToken) {
  if (headerToken) return headerToken
  try {
    const { data } = await sb
      .from('kite_session')
      .select('access_token,expires_at')
      .eq('id', 'current')
      .single()
    if (!data) return null
    if (new Date() > new Date(data.expires_at)) return null
    return data.access_token
  } catch { return null }
}

// Fetch India live quotes from Kite
async function fetchIndiaQuotes(accessToken) {
  try {
    const instruments = Object.values(INDIA_INSTRUMENTS)
    const params = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&')
    const r = await fetch(`${KITE_BASE}/quote?${params}`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${API_KEY}:${accessToken}`,
      }
    })
    const d = await r.json()
    if (d.status !== 'success') return null

    const result = {}
    for (const [key, instr] of Object.entries(INDIA_INSTRUMENTS)) {
      const q = d.data?.[instr]
      if (!q) continue
      const price   = q.last_price || 0
      const prevClose = q.ohlc?.close || q.last_price
      const change  = price - prevClose
      const changePct = prevClose ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0

      result[key] = {
        symbol:     key,
        price:      parseFloat(price.toFixed(2)),
        change:     parseFloat(change.toFixed(2)),
        changePct,
        open:       q.ohlc?.open  || 0,
        high:       q.ohlc?.high  || 0,
        low:        q.ohlc?.low   || 0,
        prevClose:  parseFloat(prevClose.toFixed(2)),
        volume:     q.volume || 0,
        avgPrice:   q.average_price || 0,
        buyQty:     q.buy_quantity  || 0,
        sellQty:    q.sell_quantity || 0,
        oi:         q.oi || 0,               // open interest for futures
        oiDayHigh:  q.oi_day_high || 0,
        oiDayLow:   q.oi_day_low  || 0,
        source:     'kite',
        timestamp:  Date.now(),
      }
    }
    return result
  } catch(e) {
    console.error('[LivePrices] Kite error:', e.message)
    return null
  }
}

// Fallback: fetch India prices from Yahoo Finance (no auth, slightly delayed)
async function fetchIndiaFallback() {
  try {
    const symbols = ['%5ENSEI', '%5ENSEBANK', '%5ECNXFIN'] // NIFTY, BANKNIFTY, FINNIFTY
    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const d = await r.json()
    const quotes = d?.quoteResponse?.result || []

    const keyMap = {
      '%5ENSEI':    'NIFTY',
      '%5ENSEBANK': 'BANKNIFTY',
      '%5ECNXFIN':  'FINNIFTY',
    }

    const result = {}
    for (const q of quotes) {
      const symEncoded = symbols.find(s => decodeURIComponent(s) === q.symbol || s.replace('%5E','') === q.symbol.replace('^',''))
      const key = Object.entries(keyMap).find(([s]) => {
        const decoded = decodeURIComponent(s)
        return decoded === q.symbol || q.symbol.includes(decoded.replace('^',''))
      })?.[1]

      if (!key) continue
      result[key] = {
        symbol:    key,
        price:     parseFloat((q.regularMarketPrice || 0).toFixed(2)),
        change:    parseFloat((q.regularMarketChange || 0).toFixed(2)),
        changePct: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
        open:      q.regularMarketOpen || 0,
        high:      q.regularMarketDayHigh || 0,
        low:       q.regularMarketDayLow  || 0,
        prevClose: q.regularMarketPreviousClose || 0,
        volume:    q.regularMarketVolume || 0,
        source:    'yahoo',
        timestamp: Date.now(),
      }
    }
    return result
  } catch(e) {
    console.error('[LivePrices] Yahoo fallback error:', e.message)
    return {}
  }
}

// Fetch crypto prices from Delta Exchange (always works, no auth)
async function fetchCryptoPrices() {
  try {
    const r = await fetch(
      `${DELTA_BASE}/v2/tickers?contract_types=perpetual_futures`,
      { headers: { 'User-Agent': 'projectzero/1.0' } }
    )
    const d = await r.json()
    const tickers = d.result || []

    const result = {}
    for (const [key, symbol] of Object.entries(CRYPTO_SYMBOLS)) {
      const t = tickers.find(t => t.symbol === symbol)
      if (!t) continue

      const price    = parseFloat(t.mark_price || 0)
      const prevClose = parseFloat(t.close || price)
      const open     = parseFloat(t.open || price)
      const change   = price - prevClose
      const changePct = prevClose ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0
      // 24h change vs open
      const change24h    = price - open
      const changePct24h = open ? parseFloat(((change24h / open) * 100).toFixed(2)) : 0

      result[key] = {
        symbol:      key,
        price:       parseFloat(price.toFixed(4)),
        change:      parseFloat(change24h.toFixed(4)),
        changePct:   changePct24h,
        open:        parseFloat(open.toFixed(4)),
        high:        parseFloat((t.high || 0).toFixed(4)),
        low:         parseFloat((t.low  || 0).toFixed(4)),
        prevClose:   parseFloat(prevClose.toFixed(4)),
        volume:      parseFloat((t.volume || 0).toFixed(2)),
        oi:          parseFloat((t.oi_value_usd || 0).toFixed(0)),
        fundingRate: parseFloat((t.funding_rate || 0).toFixed(6)),
        spotPrice:   parseFloat((t.spot_price || 0).toFixed(4)),
        source:      'delta',
        timestamp:   Date.now(),
      }
    }
    return result
  } catch(e) {
    console.error('[LivePrices] Delta error:', e.message)
    return {}
  }
}

export default async function handler(req, res) {
  // Enable CORS for same-origin polling
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  try {
    const headerToken = req.headers['x-kite-access-token']
    const accessToken = await getKiteToken(headerToken)

    // Fetch India and Crypto in parallel
    const [indiaResult, cryptoResult] = await Promise.all([
      accessToken ? fetchIndiaQuotes(accessToken) : null,
      fetchCryptoPrices(),
    ])

    // If Kite fails or no login, use Yahoo fallback for India
    const indiaData = indiaResult || await fetchIndiaFallback()

    // Market hours check (IST)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const day = now.getDay()
    const mins = now.getHours() * 60 + now.getMinutes()
    const isMarketOpen  = day >= 1 && day <= 5 && mins >= 555 && mins <= 930 // 9:15 - 3:30
    const isPreMarket   = day >= 1 && day <= 5 && mins >= 540 && mins < 555  // 9:00 - 9:15
    const isPostMarket  = day >= 1 && day <= 5 && mins > 930 && mins <= 960  // 3:30 - 4:00

    return res.status(200).json({
      status:       'success',
      india:        indiaData,
      crypto:       cryptoResult,
      kiteLoggedIn: !!accessToken,
      market: {
        isOpen:      isMarketOpen,
        isPreMarket,
        isPostMarket,
        isClosed:    !isMarketOpen && !isPreMarket && !isPostMarket,
        timeIST:     now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        dayOfWeek:   ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day],
      },
      fetchedAt: Date.now(),
    })

  } catch(err) {
    console.error('[LivePrices] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
