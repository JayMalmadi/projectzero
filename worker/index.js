// Projectzero 24/7 Automation Worker
// Runs on Railway — monitors markets, fires signals, Telegram alerts

const https = require('https')
const http  = require('http')

const CONFIG = {
  KITE_API_KEY:       process.env.KITE_API_KEY,
  KITE_API_SECRET:    process.env.KITE_API_SECRET,
  BINANCE_API_KEY:    process.env.BINANCE_API_KEY,
  ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID:   process.env.TELEGRAM_CHAT_ID,
  DASHBOARD_URL:      process.env.DASHBOARD_URL || 'https://projectzero-psi.vercel.app',
  PORT:               process.env.PORT || 3001,
  PAPER_TRADE_MIN_CONFIDENCE: 65,  // Only paper trade signals >= 65% confidence
  PAPER_TRADE_ENABLED: true,

  // ── Paper Trade Capital (FIXED — never changes, for fair comparison) ──
  // All strategies use same base. Month-end % tells you exactly what ₹10k would return.
  PAPER_BASE_INR:           10000,  // Fixed base for India strategies (₹10,000)
  PAPER_BASE_USD:           1000,   // Fixed base for Crypto/Delta strategies ($1,000)
  RISK_PER_TRADE_PCT:       1.0,    // Risk exactly 1% per trade = ₹100 / $10
  // Position size = (base × 1%) / SL distance
  // e.g. ₹10,000 × 1% = ₹100 risk. SL is ₹50 away → qty = 2 units

  // ── Trailing Stop Loss ─────────────────────────────────────
  TRAILING_SL_ENABLED:      true,
  TRAILING_SL_ACTIVATE_PCT: 1.0,   // Activate trailing SL once 1% in profit
  TRAILING_SL_TRAIL_PCT:    0.5,   // Trail SL 0.5% below highest price reached
}

// Get Kite access token from Supabase (stored when user logs in)
let cachedKiteToken = null
let cachedKiteTokenTime = 0

async function getKiteToken() {
  const now = Date.now()
  // Cache for 5 minutes
  if (cachedKiteToken && (now - cachedKiteTokenTime) < 300000) return cachedKiteToken
  try {
    const r = await fetch(`${CONFIG.DASHBOARD_URL}/api/kite-token`, {
      headers: { 'User-Agent': 'projectzero-worker/1.0' }
    })
    const d = await r.json()
    if (d.valid && d.access_token) {
      cachedKiteToken = d.access_token
      cachedKiteTokenTime = now
      return d.access_token
    }
    cachedKiteToken = null
    return null
  } catch {
    return null
  }
}

// ── Helpers ────────────────────────────────────────────────────
function fetchJSON(url, options={}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { reject(new Error(`Parse error: ${data.slice(0,100)}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

async function postJSON(url, body, headers={}) {
  return new Promise((resolve, reject) => {
    const data   = JSON.stringify(body)
    const urlObj = new URL(url)
    const opts   = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }
    const mod = urlObj.protocol === 'https:' ? https : http
    const req = mod.request(opts, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { resolve({text:d}) } })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(data)
    req.end()
  })
}

// ── Telegram ───────────────────────────────────────────────────
async function sendTelegram(message) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return
  try {
    await postJSON(
      `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: CONFIG.TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }
    )
    console.log('[Telegram] Sent:', message.slice(0, 60))
  } catch(e) {
    console.error('[Telegram] Error:', e.message)
  }
}

// ── Market hours ──────────────────────────────────────────────
function getNow() {
  return new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
}
function isIndianMarketOpen() {
  const now  = getNow()
  const day  = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930
}
function getTimeStr() {
  const n = getNow()
  return `${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}`
}


// ── Position Sizing ───────────────────────────────────────────
// Calculates quantity based on risk % of capital
// Risk-based sizing: quantity = (capital × riskPct) / (entry - stopLoss)
// Position sizing using FIXED base capital
// Risk = 1% of fixed base (₹100 for India, $10 for crypto)
// qty = riskAmount / SL_distance
// Keeps all strategies comparable on same ₹10,000 / $1,000 base
function calcPositionSize(entryPrice, stopLoss, market) {
  try {
    const base       = market === 'india' ? CONFIG.PAPER_BASE_INR : CONFIG.PAPER_BASE_USD
    const riskAmt    = base * (CONFIG.RISK_PER_TRADE_PCT / 100)  // ₹100 or $10
    const slDistance = Math.abs(entryPrice - stopLoss)
    if (!slDistance || slDistance <= 0) return 1
    const qty = Math.floor(riskAmt / slDistance)
    return Math.max(qty, 1)
  } catch {
    return 1
  }
}

// P&L as % of fixed base capital — for strategy comparison
function calcPnlPct(pnlPoints, market) {
  const base = market === 'india' ? CONFIG.PAPER_BASE_INR : CONFIG.PAPER_BASE_USD
  return parseFloat(((pnlPoints / base) * 100).toFixed(4))
}

// ── Live Price Monitor ────────────────────────────────────────
let livePrices   = {}   // { NIFTY: {price, volume,...}, BTC: {...}, ... }
let priceHistory = {}   // rolling 60-tick per instrument
const MAX_HISTORY   = 60
const FIRED_SIGNALS = new Set() // deduplicate signals per 2h bucket

async function fetchLivePrices() {
  try {
    const data = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/live-prices`)
    if (data.status !== 'success') return null
    for (const [sym, quote] of Object.entries({...(data.india||{}), ...(data.crypto||{})})) {
      livePrices[sym] = quote
      if (!priceHistory[sym]) priceHistory[sym] = []
      priceHistory[sym].push({ price: quote.price, volume: quote.volume, time: Date.now() })
      if (priceHistory[sym].length > MAX_HISTORY) priceHistory[sym].shift()
    }
    return data
  } catch(e) {
    console.error('[LivePrices] Fetch error:', e.message)
    return null
  }
}

function getCurrentPrice(symbol) {
  return livePrices[symbol]?.price || null
}

// ── Strategy Signal Jobs ───────────────────────────────────────
// Each job: symbol + strategy + market + min confidence
// Calls /api/strategy-engine which reads stored OHLCV and computes indicators
const SIGNAL_JOBS = [
  // India (only fires during market hours 9:15-3:30)
  { symbol:'NIFTY',     strategy:'ema-trend',      market:'india',  minConf:68 },
  { symbol:'NIFTY',     strategy:'macd-bollinger',  market:'india',  minConf:65 },
  { symbol:'NIFTY',     strategy:'volume-surge',    market:'india',  minConf:70 },
  { symbol:'BANKNIFTY', strategy:'ema-trend',       market:'india',  minConf:68 },
  { symbol:'BANKNIFTY', strategy:'macd-bollinger',  market:'india',  minConf:65 },
  { symbol:'FINNIFTY',  strategy:'ema-trend',       market:'india',  minConf:68 },
  // Crypto (24/7 — paper trades only, no real orders)
  { symbol:'BTC',  strategy:'ema-trend',      market:'crypto', minConf:70 },
  { symbol:'BTC',  strategy:'macd-bollinger', market:'crypto', minConf:68 },
  { symbol:'ETH',  strategy:'ema-trend',      market:'crypto', minConf:70 },
  { symbol:'SOL',  strategy:'volume-surge',   market:'crypto', minConf:72 },
  { symbol:'XRP',  strategy:'macd-bollinger', market:'crypto', minConf:70 },
]

async function checkSignals() {
  if (Object.keys(livePrices).length === 0) return

  for (const job of SIGNAL_JOBS) {
    if (job.market === 'india' && !isIndianMarketOpen()) continue

    try {
      const price = getCurrentPrice(job.symbol)
      if (!price) continue

      const url  = `${CONFIG.DASHBOARD_URL}/api/strategy-engine?symbol=${job.symbol}&strategy=${job.strategy}&livePrice=${price}`
      const data = await fetchJSON(url)

      if (!data || data.signal === 'HOLD' || data.needsBackfill) continue
      if ((data.confidence || 0) < job.minConf) continue

      // Deduplicate — same signal per strategy per 2 hours
      const key = `${job.symbol}-${job.strategy}-${data.signal}-${Math.floor(Date.now()/7200000)}`
      if (FIRED_SIGNALS.has(key)) continue
      FIRED_SIGNALS.add(key)

      const curr  = job.market === 'crypto' ? '$' : '₹'
      const emoji = data.signal === 'BUY' ? '🟢' : '🔴'
      const fmtP  = (n) => n ? `${curr}${Number(n).toLocaleString('en-US',{maximumFractionDigits:2})}` : '—'

      await sendTelegram(`${emoji} <b>SIGNAL</b> ${job.market === 'crypto' ? '🪙' : '🇮🇳'}
━━━━━━━━━━━━━━━━
<b>${data.signal} ${job.symbol}</b> · ${data.strategyName}
Price: ${fmtP(data.price)} | SL: ${fmtP(data.stopLoss)} | Target: ${fmtP(data.target)}
Confidence: ${data.confidence}%${data.rr ? ` · R:R 1:${data.rr}` : ''}

${data.reason?.slice(0,150)}

<a href="${CONFIG.DASHBOARD_URL}/dashboard">⚡ Open Dashboard →</a>`)

      console.log(`[Signal] ${data.signal} ${job.symbol} / ${job.strategy} (${data.confidence}%)`)

      // Log to signal_history
      try {
        await postJSON(`${CONFIG.DASHBOARD_URL}/api/signal-history`, {
          symbol: job.symbol, strategy: job.strategy, signal: data.signal,
          confidence: data.confidence, price: data.price,
          stopLoss: data.stopLoss, target: data.target, rr: data.rr,
          market: job.market, reason: data.reason?.slice(0,200),
        })
      } catch {}

      // Auto paper trade
      if (CONFIG.PAPER_TRADE_ENABLED && data.confidence >= CONFIG.PAPER_TRADE_MIN_CONFIDENCE && data.stopLoss) {
        try {
          const qty = calcPositionSize(data.price, data.stopLoss, job.market)
          const pt  = await postJSON(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            symbol: job.symbol, strategy: job.strategy, market: job.market,
            direction: data.signal, signal_type: job.market === 'crypto' ? 'swing' : 'intraday',
            entry_price: data.price, stop_loss: data.stopLoss, target: data.target,
            rr: data.rr, confidence: data.confidence, quantity: qty,
            notes: `Auto | ${data.strategyName} | ${data.reason?.slice(0,80)}`,
          })
          if (pt.created) console.log(`[PaperTrade] ${data.signal} ${job.symbol} @ ${data.price} qty=${qty}`)
        } catch(e) { console.error('[PaperTrade] Failed:', e.message) }
      }

    } catch(e) {
      console.error(`[Signal] Error ${job.symbol}/${job.strategy}:`, e.message)
    }
    await new Promise(r => setTimeout(r, 500))
  }
}

// ── Price alert checking ───────────────────────────────────────
async function checkPriceAlerts() {
  try {
    const alerts = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/price-alerts`)
    if (!alerts.alerts || !alerts.alerts.length) return

    // Get current prices
    const [indPrices, cryptoPrices] = await Promise.all([
      fetchJSON(`${CONFIG.DASHBOARD_URL}/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,TCS,INFY,RELIANCE,HDFCBANK,SBIN`).catch(()=>({data:{}})),
      fetchJSON(`${CONFIG.DASHBOARD_URL}/api/binance?action=prices`).catch(()=>({prices:{}})),
    ])

    for (const alert of alerts.alerts) {
      if (alert.triggered) continue

      let currentPrice = null
      if (alert.market === 'crypto') {
        currentPrice = cryptoPrices.prices?.[alert.symbol]?.price
      } else {
        currentPrice = indPrices.data?.[alert.symbol]?.price
      }

      if (!currentPrice) continue

      const triggered = alert.condition === 'above'
        ? currentPrice >= alert.target_price
        : currentPrice <= alert.target_price

      if (!triggered) continue

      const curr = alert.market === 'crypto' ? '$' : '₹'
      const msg  = `🔔 <b>PRICE ALERT TRIGGERED!</b>
━━━━━━━━━━━━━━━━
<b>${alert.symbol}</b> is now ${curr}${currentPrice.toLocaleString()}
Condition: ${alert.condition === 'above' ? '↑ Above' : '↓ Below'} ${curr}${alert.target_price.toLocaleString()}
${alert.note ? `Note: ${alert.note}` : ''}

<a href="${CONFIG.DASHBOARD_URL}/dashboard">Open Dashboard →</a>`

      await sendTelegram(msg)

      // Mark as triggered
      await postJSON(`${CONFIG.DASHBOARD_URL}/api/price-alerts`, { id: alert.id, triggered: true })
      console.log(`[Alert] ${alert.symbol} ${alert.condition} ${alert.target_price} TRIGGERED`)
    }
  } catch(e) {
    console.error('[PriceAlerts] Error:', e.message)
  }
}

// ── Morning briefing ───────────────────────────────────────────
async function sendMorningBriefing() {
  try {
    const now = getNow()
    const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]
    console.log('[Briefing] Fetching morning intelligence...')

    // Use the full morning intelligence API
    const intel = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/morning-intelligence`).catch(() => null)

    let msg = `☀️ <b>GOOD MORNING JAY! — ${day}</b>\n`
    msg += `${now.toLocaleDateString('en-IN',{day:'2-digit',month:'long'})}\n`
    msg += `━━━━━━━━━━━━━━━━\n`

    if (intel?.globalSentiment) {
      const sentEmoji = intel.globalSentiment==='BULLISH'?'🟢':intel.globalSentiment==='BEARISH'?'🔴':'🟡'
      msg += `\n${sentEmoji} Global Sentiment: <b>${intel.globalSentiment}</b>\n`
    }

    if (intel?.keySignals?.length > 0) {
      msg += `\n<b>Key Signals:</b>\n`
      intel.keySignals.slice(0,3).forEach(s => {
        msg += `${s.impact==='bullish'?'🟢':s.impact==='bearish'?'🔴':'🟡'} ${s.factor}: ${s.note}\n`
      })
    }

    if (intel?.indiaBrief) {
      msg += `\n<b>🇮🇳 Indian Markets:</b>\n${intel.indiaBrief.slice(0,500)}\n`
    }

    if (intel?.cryptoBrief) {
      msg += `\n<b>🪙 Crypto:</b>\n${intel.cryptoBrief.slice(0,250)}\n`
    }

    msg += `\n<a href="${CONFIG.DASHBOARD_URL}/morning">📊 Full Morning Report →</a>`
    msg += `\n<a href="${CONFIG.DASHBOARD_URL}/dashboard">⚡ Dashboard →</a>`

    await sendTelegram(msg)
    console.log('[Briefing] Full morning intelligence sent')
  } catch(e) {
    console.error('[Briefing] Error:', e.message)
  }
}

// ── 3:19 PM Square-Off Alert ──────────────────────────────────
async function sendSquareOffAlert() {
  try {
    const msg = `⚠️ <b>SQUARE-OFF ALERT — 3:19 PM IST</b>
━━━━━━━━━━━━━━━━
MIS positions will auto-close at <b>3:25 PM</b> (Zerodha).

Action required:
• Check your open MIS positions
• Decide: close manually or let auto-close happen
• Review P&amp;L before market closes at 3:30 PM

<a href="${CONFIG.DASHBOARD_URL}/dashboard">📊 Check Portfolio →</a>`

    await sendTelegram(msg)
    console.log('[SquareOff] 3:19 PM alert sent')
  } catch(e) {
    console.error('[SquareOff] Error:', e.message)
  }
}

// ── Daily summary ─────────────────────────────────────────────
async function sendDailySummary() {
  try {
    // Fetch today's trades
    const tradesData = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/trades?limit=20`).catch(()=>({trades:[]}))
    const todayTrades = (tradesData.trades || []).filter(t => {
      const d = new Date(t.created_at)
      const now = getNow()
      return d.toDateString() === now.toDateString()
    })

    const closedToday = todayTrades.filter(t => t.status === 'CLOSED')
    const openToday   = todayTrades.filter(t => t.status === 'OPEN')
    const totalPnl    = closedToday.reduce((a,t) => a + parseFloat(t.pnl||0), 0)
    const wins        = closedToday.filter(t => parseFloat(t.pnl||0) > 0).length
    const losses      = closedToday.filter(t => parseFloat(t.pnl||0) <= 0).length

    const msg = `📊 <b>DAILY SUMMARY — ${getNow().toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</b>
━━━━━━━━━━━━━━━━
Trades today: ${todayTrades.length}
Closed: ${closedToday.length} (${wins}W / ${losses}L)
Open positions: ${openToday.length}

<b>Today's P&amp;L: ${totalPnl >= 0 ? '🟢' : '🔴'} ₹${totalPnl.toFixed(2)}</b>

${openToday.length > 0 ? `⚠️ You have ${openToday.length} open position(s)!\n` : ''}
<a href="${CONFIG.DASHBOARD_URL}/dashboard">View Full History →</a>`

    await sendTelegram(msg)
    console.log('[Summary] Daily summary sent, P&L:', totalPnl.toFixed(2))

    // Save summary to daily_reports
    try {
      const today = getNow().toISOString().split('T')[0]
      await fetch(`${CONFIG.DASHBOARD_URL}/api/daily-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_date: today,
          daily_summary: msg.replace(/<[^>]+>/g,'').slice(0, 2000),
          trades_today: closedToday.length,
          pnl_today: totalPnl,
        })
      }).catch(() => {})
      console.log('[Summary] Saved to daily_reports')
    } catch(e) {
      console.error('[Summary] DB save error:', e.message)
    }
  } catch(e) {
    console.error('[Summary] Error:', e.message)
  }
}

// ── Paper Trade Monitor ───────────────────────────────────────
async function monitorPaperTrades() {
  try {
    const now = getNow()
    const isMarketHours = isIndianMarketOpen()

    // Fetch all open paper trades
    const r = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/paper-trades?status=OPEN&limit=50`)
    const openTrades = r.open || []

    if (openTrades.length === 0) return

    // Fetch ALL prices in ONE call (much more efficient than per-trade fetching)
    let allPrices = {}
    try {
      // Indian market prices
      const indiaSymbols = [...new Set(openTrades.filter(t => t.market === 'india').map(t => t.symbol))]
      if (indiaSymbols.length > 0 && isMarketHours) {
        const mktR = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/market?symbols=${indiaSymbols.join(',')}`)
        Object.assign(allPrices, mktR.data || {})
      }
      // Crypto prices (always fetch — 24/7)
      const hasCrypto = openTrades.some(t => t.market === 'crypto' || t.market === 'delta')
      if (hasCrypto) {
        const deltaR = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/delta?action=prices`)
        // Map Delta prices: { BTC: { price: 81000 }, ... }
        for (const [sym, data] of Object.entries(deltaR.prices || {})) {
          allPrices[sym] = { price: data.price }
        }
      }
    } catch(e) {
      console.error('[PaperMonitor] Price fetch error:', e.message)
      return  // skip this cycle if prices unavailable
    }

    if (Object.keys(allPrices).length === 0) return
    console.log(`[PaperMonitor] Checking ${openTrades.length} trades, ${Object.keys(allPrices).length} price feeds`)

    // Check if it's after 3:15 PM IST — close all intraday trades
    const hour = now.getHours()
    const min  = now.getMinutes()
    const afterClose = hour > 15 || (hour === 15 && min >= 15)

    for (const trade of openTrades) {
      try {
        if (trade.signal_type === 'intraday' && afterClose && (trade.market === 'india' || !trade.market)) {
          // Auto-close intraday trades at 3:15 PM
          // Get current price
          // Use pre-fetched price
          let currentPrice = allPrices[trade.symbol]?.price || trade.entry_price

          const qty       = trade.quantity || 1
          const pnlPoints = (trade.direction === 'BUY'
            ? currentPrice - trade.entry_price
            : trade.entry_price - currentPrice) * qty
          // pnl_pct = P&L as % of fixed base capital (₹10k or $1k) — not % of entry price
          const base    = (trade.market === 'crypto' || trade.market === 'delta') ? CONFIG.PAPER_BASE_USD : CONFIG.PAPER_BASE_INR
          const pnlPct  = parseFloat(((pnlPoints / base) * 100).toFixed(4))

          await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: trade.id,
              status:      pnlPoints >= 0 ? 'WIN' : 'LOSS',
              exit_price:  currentPrice,
              exit_reason: 'MARKET_CLOSE',
              pnl_points:  parseFloat(pnlPoints.toFixed(2)),
              pnl_pct:     pnlPct,
            })
          })
          console.log(`[PaperMonitor] Closed at market: ${trade.symbol} P&L: ${pnlPoints.toFixed(0)} pts`)
          continue
        }

        // During market hours — check if SL or Target hit
        // Skip monitoring: Indian trades outside market hours, crypto never skipped
        if (!isMarketHours && (trade.market === 'india' || !trade.market)) continue
        // Crypto: auto-close after 24 hours if neither SL nor target hit
        if ((trade.market === 'crypto' || trade.market === 'delta') && trade.opened_at) {
          const ageHours = (Date.now() - new Date(trade.opened_at).getTime()) / 3600000
          if (ageHours > 24) {
            const exitP   = allPrices[trade.symbol]?.price || trade.entry_price
            const qty24   = trade.quantity || 1
            const pnlPts  = (trade.direction === 'BUY' ? exitP - trade.entry_price : trade.entry_price - exitP) * qty24
            const base24  = (trade.market === 'crypto' || trade.market === 'delta') ? CONFIG.PAPER_BASE_USD : CONFIG.PAPER_BASE_INR
            const pnlPct24 = parseFloat(((pnlPts / base24) * 100).toFixed(4))
            await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: trade.id, status: pnlPts >= 0 ? 'WIN' : 'LOSS',
                exit_price: exitP, exit_reason: '24H_EXPIRED', pnl_points: parseFloat(pnlPts.toFixed(4)), pnl_pct: pnlPct24 })
            })
            console.log(`[PaperMonitor] Crypto 24h close: ${trade.symbol} ${pnlPts.toFixed(2)} pts`)
            continue
          }
        }

        // Use pre-fetched prices (no extra API call per trade)
        const currentPrice = getCurrentPrice(trade.symbol) || allPrices[trade.symbol]?.price || null

        if (!currentPrice) continue

        // ── Trailing Stop Loss ──────────────────────────────
        if (CONFIG.TRAILING_SL_ENABLED && trade.stop_loss && trade.entry_price) {
          const profitPct = trade.direction === 'BUY'
            ? (currentPrice - trade.entry_price) / trade.entry_price * 100
            : (trade.entry_price - currentPrice) / trade.entry_price * 100

          // Activate once trade is in profit by TRAILING_SL_ACTIVATE_PCT
          if (profitPct >= CONFIG.TRAILING_SL_ACTIVATE_PCT) {
            const trailAmt = currentPrice * (CONFIG.TRAILING_SL_TRAIL_PCT / 100)
            const newSL = trade.direction === 'BUY'
              ? currentPrice - trailAmt
              : currentPrice + trailAmt

            // Only move SL in favour — never widen it
            const shouldUpdate = trade.direction === 'BUY'
              ? newSL > trade.stop_loss
              : newSL < trade.stop_loss

            if (shouldUpdate) {
              await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: trade.id, stop_loss: parseFloat(newSL.toFixed(4)) })
              })
              console.log(`[TrailingSL] ${trade.symbol} SL moved to ${newSL.toFixed(4)}`)
            }
          }
        }

        const slHit  = trade.stop_loss && (
          trade.direction === 'BUY'  ? currentPrice <= trade.stop_loss :
          trade.direction === 'SELL' ? currentPrice >= trade.stop_loss : false
        )
        const tgtHit = trade.target && (
          trade.direction === 'BUY'  ? currentPrice >= trade.target :
          trade.direction === 'SELL' ? currentPrice <= trade.target : false
        )

        if (slHit || tgtHit) {
          const exitPrice  = slHit ? trade.stop_loss : trade.target
          const qty        = trade.quantity || 1
          const pnlPoints  = (trade.direction === 'BUY'
            ? exitPrice - trade.entry_price
            : trade.entry_price - exitPrice) * qty
          // P&L as % of fixed base capital — the key metric for strategy comparison
          const base       = (trade.market === 'crypto' || trade.market === 'delta') ? CONFIG.PAPER_BASE_USD : CONFIG.PAPER_BASE_INR
          const pnlPct     = parseFloat(((pnlPoints / base) * 100).toFixed(4))
          // Risk % of base (how much this trade risked)
          const riskPoints = Math.abs(trade.entry_price - trade.stop_loss) * qty
          const riskPct    = parseFloat(((riskPoints / base) * 100).toFixed(4))
          // Actual R:R achieved
          const actualRR   = riskPoints > 0 ? parseFloat((Math.abs(pnlPoints) / riskPoints).toFixed(2)) : 0

          await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: trade.id,
              status:      tgtHit ? 'WIN' : 'LOSS',
              exit_price:  exitPrice,
              exit_reason: tgtHit ? 'TARGET_HIT' : 'SL_HIT',
              pnl_points:  parseFloat(pnlPoints.toFixed(2)),
              pnl_pct:     pnlPct,
              rr:          actualRR,
            })
          })

          const curr  = (trade.market === 'crypto' || trade.market === 'delta') ? '$' : '₹'
          const emoji = tgtHit ? '🎯' : '🛑'
          const msg   = emoji + ' <b>PAPER TRADE ' + (tgtHit?'WIN':'LOSS') + '</b>\n' +
            trade.direction + ' ' + trade.symbol + ' · ' + trade.strategy + '\n' +
            'Entry: ' + curr + trade.entry_price + ' → Exit: ' + curr + exitPrice + '\n' +
            'Qty: ' + qty + ' · Risk: ' + (riskPct >= 0?'+':'') + riskPct.toFixed(2) + '% of base\n' +
            'P&L: ' + (pnlPoints >= 0?'+':'') + pnlPoints.toFixed(2) + ' (' + (pnlPct >= 0?'+':'') + pnlPct.toFixed(2) + '% of base)\n' +
            'R:R achieved: 1:' + actualRR + '\n' +
            'Reason: ' + (tgtHit ? 'Target hit ✅' : 'Stop loss hit ❌')
          await sendTelegram(msg)
          console.log('[PaperMonitor] ' + (tgtHit?'WIN':'LOSS') + ': ' + trade.symbol + ' ' + pnlPct.toFixed(2) + '% of base')
        }
      } catch(e) {
        console.error(`[PaperMonitor] Error on trade ${trade.id}:`, e.message)
      }
    }
  } catch(e) {
    console.error('[PaperMonitor] Error:', e.message)
  }
}


// ── NFO Instruments Cache ─────────────────────────────────────
// Fetches NFO instruments from Kite and stores in Supabase
// Called at 8:55 AM so option chain is ready when market opens
// Worker has no timeout limit unlike Vercel serverless
let lastNFODate = ''

async function refreshNFOCache() {
  try {
    const token = await getKiteToken()
    if (!token) {
      console.log('[NFOCache] No Kite token — skip')
      return
    }
    const API_KEY = process.env.KITE_API_KEY
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

    console.log('[NFOCache] Fetching NFO instruments from Kite...')

    // Fetch the 5MB instruments file
    const r = await fetch('https://api.kite.trade/instruments/NFO', {
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${token}` }
    })
    const text = await r.text()
    const lines = text.split('\n')
    const header = lines[0] || ''
    const hCols = header.split(',')

    let ci = {
      token: hCols.indexOf('instrument_token'), sym: hCols.indexOf('tradingsymbol'),
      name: hCols.indexOf('name'), expiry: hCols.indexOf('expiry'),
      strike: hCols.indexOf('strike'), lot: hCols.indexOf('lot_size'),
      type: hCols.indexOf('instrument_type'),
    }
    if (ci.token < 0) { ci = { token:0, sym:2, name:3, expiry:5, strike:6, lot:8, type:9 } }

    const today = new Date().toISOString().split('T')[0]
    const symbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY']
    const bySymbol = { NIFTY: [], BANKNIFTY: [], FINNIFTY: [] }

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const cols = line.split(',')
      if (cols.length < 8) continue
      const iName = (cols[ci.name] || '').trim().replace(/^"|"$/g, '')  // strip CSV quotes
      const iType = (cols[ci.type] || '').trim()
      if (!symbols.includes(iName)) continue
      if (iType !== 'CE' && iType !== 'PE') continue
      const expiry = (cols[ci.expiry] || '').trim()
      if (expiry < today) continue
      bySymbol[iName].push({
        token: cols[ci.token], symbol: cols[ci.sym],
        expiry, strike: parseFloat(cols[ci.strike]),
        lotSize: parseInt(cols[ci.lot]) || 25, type: iType,
      })
    }

    // Save each symbol to Supabase via REST API
    for (const sym of symbols) {
      const instruments = bySymbol[sym]
      if (!instruments.length) continue

      const body = JSON.stringify([{
        symbol: sym,
        cached_date: today,
        instruments_json: JSON.stringify(instruments),
        count: instruments.length,
      }])

      await fetch(`${SUPABASE_URL}/rest/v1/nfo_instruments_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'apikey': SUPABASE_KEY,
          'Prefer': 'resolution=merge-duplicates',
        },
        body,
      })
      console.log(`[NFOCache] Saved ${instruments.length} instruments for ${sym}`)
    }

    console.log('[NFOCache] Done — all 3 symbols cached')
    await sendTelegram(`✅ Options chain cache updated\nNIFTY: ${bySymbol.NIFTY.length} | BANKNIFTY: ${bySymbol.BANKNIFTY.length} | FINNIFTY: ${bySymbol.FINNIFTY.length}`).catch(()=>{})

  } catch(e) {
    console.error('[NFOCache] Error:', e.message)
  }
}


// ── Daily Historical Data Update ──────────────────────────────
// Runs at 4:05 PM IST after market close
// Appends today's candles to Supabase for all 7 instruments
let lastDataUpdateDate = ''

async function updateHistoricalData() {
  try {
    console.log('[HistData] Running daily update...')
    const r = await fetch(`${CONFIG.DASHBOARD_URL}/api/historical-data?action=backfill&days=3`, {
      headers: { 'User-Agent': 'projectzero-worker/1.0' }
    })
    const d = await r.json()
    if (d.status === 'success') {
      const summary = Object.entries(d.results || {})
        .map(([k,v]) => `${k}: ${v.saved}`)
        .join(', ')
      console.log('[HistData] Update complete:', summary)
    }
  } catch(e) {
    console.error('[HistData] Update error:', e.message)
  }
}


// ── Historical Data Backfill ──────────────────────────────────
// Fetches OHLCV candles and stores in Supabase for backtesting
// Runs on boot and daily at 4 PM after market close
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const DELTA_BASE   = 'https://api.india.delta.exchange'
const KITE_BASE_H  = 'https://api.kite.trade'

let lastHistDate = ''

async function backfillHistoricalData(forceAll=false) {
  try {
    console.log('[HistData] Starting backfill...')
    const results = {}

    // ── Crypto: Delta Exchange 15min (no auth) ─────────────
    const cryptoSyms = { BTC:'BTCUSD', ETH:'ETHUSD', SOL:'SOLUSD', XRP:'XRPUSD' }
    const days = forceAll ? 60 : 2 // full 60d on first run, just 2d daily after

    for (const [sym, deltaSym] of Object.entries(cryptoSyms)) {
      try {
        const now   = Math.floor(Date.now() / 1000)
        const start = now - (days * 86400)
        const r = await fetch(
          `${DELTA_BASE}/v2/history/candles?symbol=${deltaSym}&resolution=15m&start=${start}&end=${now}`,
          { headers: { 'User-Agent': 'projectzero/1.0' } }
        )
        const d = await r.json()
        const candles = (d.result || []).map(c => ({
          symbol: sym, market: 'crypto',
          ts:     new Date(c.time * 1000).toISOString(),
          open: parseFloat(c.open), high: parseFloat(c.high),
          low:  parseFloat(c.low),  close: parseFloat(c.close),
          volume: parseFloat(c.volume),
        }))

        if (candles.length > 0) {
          await upsertOHLCV('ohlcv_15min', candles)
          results[`${sym}_15min`] = candles.length
          console.log(`[HistData] ${sym} 15min: ${candles.length} candles stored`)
        }

        // Daily candles
        const rD = await fetch(
          `${DELTA_BASE}/v2/history/candles?symbol=${deltaSym}&resolution=1d&start=${now-(365*86400)}&end=${now}`,
          { headers: { 'User-Agent': 'projectzero/1.0' } }
        )
        const dD = await rD.json()
        const daily = (dD.result || []).map(c => ({
          symbol: sym, market: 'crypto',
          date: new Date(c.time * 1000).toISOString().split('T')[0],
          open: parseFloat(c.open), high: parseFloat(c.high),
          low: parseFloat(c.low), close: parseFloat(c.close),
          volume: parseFloat(c.volume),
        }))
        if (daily.length > 0) {
          await upsertOHLCV('ohlcv_daily', daily)
          results[`${sym}_daily`] = daily.length
          console.log(`[HistData] ${sym} daily: ${daily.length} candles stored`)
        }
      } catch(e) {
        console.error(`[HistData] ${sym} error:`, e.message)
      }
      await new Promise(r => setTimeout(r, 500)) // throttle
    }

    // ── India: Yahoo Finance daily (no auth) ───────────────
    const indiaYahoo = { NIFTY:'%5ENSEI', BANKNIFTY:'%5ENSEBANK', FINNIFTY:'%5ECNXFIN' }
    for (const [sym, ticker] of Object.entries(indiaYahoo)) {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        const d = await r.json()
        const result = d?.chart?.result?.[0]
        if (!result) continue
        const ts = result.timestamp || []
        const q  = result.indicators?.quote?.[0] || {}
        const daily = ts.map((t, i) => ({
          symbol: sym, market: 'india',
          date:   new Date(t * 1000).toISOString().split('T')[0],
          open:   parseFloat((q.open?.[i] || 0).toFixed(2)),
          high:   parseFloat((q.high?.[i] || 0).toFixed(2)),
          low:    parseFloat((q.low?.[i]  || 0).toFixed(2)),
          close:  parseFloat((q.close?.[i]|| 0).toFixed(2)),
          volume: q.volume?.[i] || 0,
        })).filter(c => c.close > 0)

        if (daily.length > 0) {
          await upsertOHLCV('ohlcv_daily', daily)
          results[`${sym}_daily`] = daily.length
          console.log(`[HistData] ${sym} daily: ${daily.length} candles stored`)
        }
      } catch(e) {
        console.error(`[HistData] ${sym} Yahoo error:`, e.message)
      }
    }

    // ── India: Kite 15min (requires daily login) ───────────
    const kiteToken = await getKiteToken()
    if (kiteToken) {
      const kiteTokens = { NIFTY:'256265', BANKNIFTY:'260105', FINNIFTY:'257801' }
      const to   = new Date()
      const from = new Date()
      from.setDate(from.getDate() - (forceAll ? 60 : 2))
      const fromStr = from.toISOString().split('T')[0] + ' 09:15:00'
      const toStr   = to.toISOString().split('T')[0] + ' 15:30:00'

      for (const [sym, token] of Object.entries(kiteTokens)) {
        try {
          const r = await fetch(
            `${KITE_BASE_H}/instruments/historical/${token}/15minute?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&continuous=0&oi=0`,
            { headers: { 'X-Kite-Version':'3', 'Authorization':`token ${process.env.KITE_API_KEY}:${kiteToken}` } }
          )
          const d = await r.json()
          const candles = (d.data?.candles || []).map(c => ({
            symbol: sym, market: 'india',
            ts: new Date(c[0]).toISOString(),
            open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
          }))
          if (candles.length > 0) {
            await upsertOHLCV('ohlcv_15min', candles)
            results[`${sym}_15min`] = candles.length
            console.log(`[HistData] ${sym} 15min Kite: ${candles.length} candles stored`)
          }
        } catch(e) {
          console.error(`[HistData] ${sym} Kite error:`, e.message)
        }
      }
    } else {
      console.log('[HistData] No Kite token — skipping India 15min')
    }

    const total = Object.values(results).reduce((a,b) => a+b, 0)
    console.log(`[HistData] Backfill done — ${total} total candles across ${Object.keys(results).length} datasets`)
    return results
  } catch(e) {
    console.error('[HistData] Backfill error:', e.message)
    return {}
  }
}

async function upsertOHLCV(table, rows) {
  if (!rows.length) return
  const batchSize = 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(batch),
    })
  }
}

// ── Main scheduler ────────────────────────────────────────────
let checkCount     = 0
let lastBriefDate  = ''
let lastSummDate   = ''
let lastSquareDate = ''
let lastAlertCheck = 0

async function tick() {
  checkCount++
  const now     = getNow()
  const h       = now.getHours()
  const m       = now.getMinutes()
  const dateStr = now.toDateString()
  const isWkday = now.getDay() >= 1 && now.getDay() <= 5

  // NFO cache refresh — 8:55 AM IST weekdays (ready before market opens)
  if (isWkday && h===8 && m===55 && lastNFODate!==dateStr) {
    lastNFODate = dateStr
    refreshNFOCache().catch(e => console.error('[NFOCache] tick error:', e.message))
  }

  // Morning briefing — 9:00 AM IST weekdays
  if (isWkday && h===9 && m===0 && lastBriefDate!==dateStr) {
    lastBriefDate = dateStr
    await sendMorningBriefing()
  }

  // Daily historical data update — 4:05 PM IST weekdays (after market close)
  if (isWkday && h===16 && m===5 && lastDataUpdateDate!==dateStr) {
    lastDataUpdateDate = dateStr
    updateHistoricalData().catch(e => console.error('[HistData] tick error:', e.message))
  }

  // Historical data backfill — 4:05 PM IST weekdays (after market close)
  if (isWkday && h===16 && m===5 && lastHistDate!==dateStr) {
    lastHistDate = dateStr
    backfillHistoricalData(false).catch(e => console.error('[HistData] 4PM error:', e.message))
  }

  // Daily OHLCV update — 4:00 PM IST weekdays (after market close)
  if (isWkday && h===16 && m===0 && !firedToday.has('ohlcv_update')) {
    firedToday.add('ohlcv_update')
    console.log('[OHLCVUpdate] Running daily data update...')
    fetch(`${CONFIG.DASHBOARD_URL}/api/backfill?target=all&daysBack=2`)
      .then(r => r.json())
      .then(d => console.log('[OHLCVUpdate] Done:', JSON.stringify(d.results)))
      .catch(e => console.error('[OHLCVUpdate] Error:', e.message))
  }

  // Square-off alert — 3:19 PM IST weekdays
  if (isWkday && h===15 && m===19 && lastSquareDate!==dateStr) {
    lastSquareDate = dateStr
    await sendSquareOffAlert()
  }

  // Daily summary — 3:35 PM IST weekdays
  if (isWkday && h===15 && m===35 && lastSummDate!==dateStr) {
    lastSummDate = dateStr
    await sendDailySummary()
  }

  // Signal checks
  const checkIndian  = isIndianMarketOpen() && checkCount % 2 === 0  // every ~60s
  const checkCrypto  = checkCount % 4 === 0                           // every ~120s

  // Always fetch live prices on every tick (every 15s)
  await fetchLivePrices().catch(e => console.error('[tick] Live prices error:', e.message))
  if (checkIndian || checkCrypto) {
    await checkSignals()
  }

  // Price alerts — every 5 minutes
  if (Date.now() - lastAlertCheck > 300000) {
    lastAlertCheck = Date.now()
    await checkPriceAlerts()
  }
}

// ── Health check server ────────────────────────────────────────
const server = http.createServer((req, res) => {
  const now = getNow()

  // ── Delta Exchange Proxy ─────────────────────────────────
  // Vercel calls this endpoint; Railway has fixed IP whitelisted on Delta
  if (req.url.startsWith('/delta-proxy') && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      try {
        const { path, method = 'GET', payload } = JSON.parse(body)
        if (!path || !path.startsWith('/v2/')) {
          res.writeHead(400, {'Content-Type':'application/json'})
          res.end(JSON.stringify({ error: 'Invalid path' }))
          return
        }

        const crypto   = await import('crypto')
        const apiKey    = process.env.DELTA_API_KEY
        const apiSecret = process.env.DELTA_API_SECRET
        if (!apiKey || !apiSecret) {
          res.writeHead(401, {'Content-Type':'application/json'})
          res.end(JSON.stringify({ error: 'Delta keys not configured in Railway env' }))
          return
        }

        const timestamp = Math.floor(Date.now() / 1000).toString()
        const bodyStr   = payload ? JSON.stringify(payload) : ''
        const msg       = method + timestamp + path + bodyStr
        const sig       = crypto.default.createHmac('sha256', apiSecret).update(msg).digest('hex')

        const deltaRes = await fetch(`https://api.india.delta.exchange${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'api-key':      apiKey,
            'timestamp':    timestamp,
            'signature':    sig,
            'User-Agent':   'projectzero-railway/1.0',
          },
          ...(bodyStr ? { body: bodyStr } : {}),
        })
        const deltaData = await deltaRes.text()
        res.writeHead(deltaRes.status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'})
        res.end(deltaData)
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'})
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // ── IP check (so we can get Railway's outbound IP) ───────
  if (req.url === '/myip') {
    res.writeHead(200, {'Content-Type':'application/json'})
    res.end(JSON.stringify({ ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress, ok: true }))
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'})
    res.end(JSON.stringify({
      status:    'ok',
      worker:    'projectzero-automation-v2',
      time:      now.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'}),
      market:    isIndianMarketOpen() ? 'OPEN' : 'CLOSED',
      checks:    checkCount,
      telegram:  !!CONFIG.TELEGRAM_BOT_TOKEN,
      features:  ['signals','price_alerts','morning_briefing','squareoff_319pm','daily_summary','multi_timeframe'],
    }))
  } else {
    res.writeHead(200, {'Content-Type':'text/plain'})
    res.end('Projectzero Worker v2 — Running')
  }
})

server.listen(CONFIG.PORT, () => {
  console.log(`[Worker] Projectzero v2 started on port ${CONFIG.PORT}`)
  console.log(`[Worker] Dashboard: ${CONFIG.DASHBOARD_URL}`)
  console.log(`[Worker] Telegram: ${CONFIG.TELEGRAM_BOT_TOKEN ? 'Configured ✅' : 'NOT configured'}`)
  console.log(`[Worker] Features: signals, price alerts, 3:19pm alert, morning briefing, daily summary`)
})

// ── Boot notification ─────────────────────────────────────────
// Fetch and announce Railway's outbound IP on startup
fetch('https://api.ipify.org?format=json')
  .then(r => r.json())
  .then(d => {
    console.log(`[Worker] Outbound IP: ${d.ip} (Railway — variable, not used for Delta)`)
    // No Telegram alert — Railway IP changes on every deploy, Hetzner (178.105.45.73) is the fixed IP
  }).catch(()=>{})

// Refresh NFO cache on boot
setTimeout(() => refreshNFOCache().catch(()=>{}), 5000)

// Full historical data backfill on boot (runs after 30s to not overwhelm startup)
setTimeout(() => backfillHistoricalData(true).catch(()=>{}), 30000)

sendTelegram(`🚀 <b>Projectzero Worker v2 Started</b>
━━━━━━━━━━━━━━━━
✅ Signal monitoring (every 30s)
✅ Price alerts (every 5 min)
✅ Morning briefing at 9:00 AM IST
✅ Square-off alert at 3:19 PM IST
✅ Daily summary at 3:35 PM IST
✅ Multi-timeframe confluence checks

<a href="${CONFIG.DASHBOARD_URL}/dashboard">Dashboard →</a>`).catch(()=>{})

// Start ticking every 30 seconds
tick().catch(console.error)
setInterval(() => tick().catch(console.error), 15000) // Every 15s — live prices fetched each tick

// ── Fast loop: paper trade monitoring every 5 seconds ─────────
// Uses PUBLIC Delta/market price APIs — no auth, no Fixie needed
// Checks if SL or Target hit for any open paper trade
let paperMonitorRunning = false
setInterval(async () => {
  if (paperMonitorRunning) return  // skip if previous check still running
  paperMonitorRunning = true
  try {
    await monitorPaperTrades()
  } catch(e) {
    console.error('[FastMonitor]', e.message)
  }
  paperMonitorRunning = false
}, 5000)  // Every 5 seconds
