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

  // ── Position Sizing ────────────────────────────────────────
  // Paper trading capital (simulated) — used for position sizing
  PAPER_CAPITAL_USD:        1000,   // Crypto paper capital in USD
  PAPER_CAPITAL_INR:        50000,  // India paper capital in INR
  RISK_PER_TRADE_PCT:       1.5,    // Risk 1.5% of capital per trade
  MAX_POSITION_PCT:         10,     // Never more than 10% of capital in one trade

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
function calcPositionSize(entryPrice, stopLoss, market) {
  try {
    const capital    = market === 'india' ? CONFIG.PAPER_CAPITAL_INR : CONFIG.PAPER_CAPITAL_USD
    const riskAmt    = capital * (CONFIG.RISK_PER_TRADE_PCT / 100)  // e.g. ₹750
    const slDistance = Math.abs(entryPrice - stopLoss)
    if (!slDistance || slDistance <= 0) return 1

    let qty = Math.floor(riskAmt / slDistance)

    // Cap at MAX_POSITION_PCT of capital
    const maxQty = Math.floor((capital * CONFIG.MAX_POSITION_PCT / 100) / entryPrice)
    qty = Math.min(qty, maxQty)

    return Math.max(qty, 1)  // always at least 1
  } catch {
    return 1
  }
}

// ── Signal monitoring ─────────────────────────────────────────
const FIRED_SIGNALS = new Set() // prevent duplicate alerts

async function checkSignals() {
  const strategies = []

  // Indian market strategies (only during market hours)
  if (isIndianMarketOpen()) {
    strategies.push(
      { symbol:'NIFTY',     strategy:'pz-orb',      market:'india',  minConf:65 },
      { symbol:'BANKNIFTY', strategy:'pz-tuesday',   market:'india',  minConf:60 },
      { symbol:'BANKNIFTY', strategy:'vwap',         market:'india',  minConf:60 },
      { symbol:'NIFTY',     strategy:'bollinger',    market:'india',  minConf:65 },
      { symbol:'TCS',       strategy:'macd',         market:'india',  minConf:65 },
    )
  }

  // Crypto strategies (24/7) — paper trades only, no real orders
  strategies.push(
    { symbol:'BTC', strategy:'momentum',     market:'crypto', minConf:70 },
    { symbol:'ETH', strategy:'macd-cross',   market:'crypto', minConf:70 },
    { symbol:'SOL', strategy:'rsi-reversal', market:'crypto', minConf:70 },
    { symbol:'XRP', strategy:'rsi-reversal', market:'crypto', minConf:75 },
    { symbol:'BTC', strategy:'macd-cross',   market:'crypto', minConf:72 },
    // Delta Exchange perpetual futures — paper only
    { symbol:'BTC', strategy:'momentum',     market:'delta',  minConf:72 },
    { symbol:'ETH', strategy:'macd-cross',   market:'delta',  minConf:72 },
    { symbol:'SOL', strategy:'rsi-reversal', market:'delta',  minConf:75 },
  )

  for (const s of strategies) {
    try {
      const apiPath = s.market === 'crypto'
        ? `/api/crypto-signals?symbol=${s.symbol}&strategy=${s.strategy}`
        : `/api/pz-strategies?symbol=${s.symbol}&strategy=${s.strategy}`

      const data = await fetchJSON(`${CONFIG.DASHBOARD_URL}${apiPath}`)

      if (!data.signal || data.signal === 'HOLD') continue
      if (data.confidence < s.minConf) continue

      // Deduplicate — don't fire same signal twice in 2 hours
      const key = `${s.symbol}-${s.strategy}-${data.signal}-${Math.floor(Date.now()/7200000)}`
      if (FIRED_SIGNALS.has(key)) continue
      FIRED_SIGNALS.add(key)

      const emoji    = data.signal === 'BUY' ? '🟢' : '🔴'
      const mktEmoji = s.market === 'crypto' ? '🪙' : '🇮🇳'
      const curr     = s.market === 'crypto' ? '$' : '₹'
      const fmtP     = (n) => n ? `${curr}${Number(n).toLocaleString('en-US',{maximumFractionDigits:2})}` : '—'

      // Check multi-timeframe confluence
      let mtfNote = ''
      try {
        const mtf = await fetchJSON(`${CONFIG.DASHBOARD_URL}/api/multi-timeframe?symbol=${s.symbol}&market=${s.market}`)
        if (mtf.confluence) mtfNote = `\nTimeframes: ${mtf.confluence} (${mtf.score}/3)`
      } catch {}

      const msg = `${emoji} <b>SIGNAL FIRED</b> ${mktEmoji}
━━━━━━━━━━━━━━━━
<b>${data.signal} ${s.symbol}</b> · ${s.strategy}
Price: ${fmtP(data.price)}
Stop Loss: ${fmtP(data.stopLoss)}
Target: ${fmtP(data.target)}
Confidence: ${data.confidence}%${data.rr?` · R:R 1:${data.rr}`:''}${mtfNote}

${data.reason?.slice(0,120)}

<a href="${CONFIG.DASHBOARD_URL}/dashboard">⚡ Open Dashboard to Execute →</a>`

      await sendTelegram(msg)
      console.log(`[Signal] ${data.signal} ${s.symbol} (${data.confidence}%)`)

      // Log to signal_history DB
      try {
        await postJSON(`${CONFIG.DASHBOARD_URL}/api/signal-history`, {
          symbol: s.symbol, strategy: s.strategy, signal: data.signal,
          confidence: data.confidence, price: data.price,
          stopLoss: data.stopLoss, target: data.target,
          rr: data.rr, rsi: data.indicators?.rsi,
          market: s.market, reason: data.reason?.slice(0, 200)
        })
      } catch {}

      // Auto paper trade if confidence >= threshold
      if (CONFIG.PAPER_TRADE_ENABLED && data.confidence >= CONFIG.PAPER_TRADE_MIN_CONFIDENCE) {
        try {
          const ptResult = await postJSON(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            symbol:     s.symbol,
            strategy:   s.strategy,
            market:     s.market,
            direction:  data.signal,
            signal_type:'intraday',
            entry_price: data.price,
            stop_loss:   data.stopLoss,
            target:      data.target,
            rr:          data.rr,
            confidence:  data.confidence,
            quantity:    calcPositionSize(data.price, data.stopLoss, s.market),
            notes: `Auto paper trade | ${data.reason?.slice(0,100)}`,
          })
          if (ptResult.created) {
            console.log(`[PaperTrade] Created: ${data.signal} ${s.symbol} @ ${data.price}`)
          }
        } catch(e) {
          console.error('[PaperTrade] Failed to create:', e.message)
        }
      }

    } catch(e) {
      console.error(`[Signal] Error ${s.symbol}/${s.strategy}:`, e.message)
    }
    await new Promise(r => setTimeout(r, 1500)) // throttle
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

          const pnlPoints = trade.direction === 'BUY'
            ? currentPrice - trade.entry_price
            : trade.entry_price - currentPrice
          const pnlPct = (pnlPoints / trade.entry_price) * 100

          await postJSON(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            _method: 'PATCH', id: trade.id,
            status:     pnlPoints >= 0 ? 'WIN' : 'LOSS',
            exit_price:  currentPrice,
            exit_reason: 'MARKET_CLOSE',
            pnl_points:  parseFloat(pnlPoints.toFixed(2)),
            pnl_pct:     parseFloat(pnlPct.toFixed(4)),
          })
          // PATCH via fetch directly
          await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: trade.id,
              status:     pnlPoints >= 0 ? 'WIN' : 'LOSS',
              exit_price:  currentPrice,
              exit_reason: 'MARKET_CLOSE',
              pnl_points:  parseFloat(pnlPoints.toFixed(2)),
              pnl_pct:     parseFloat(pnlPct.toFixed(4)),
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
            const exitP = allPrices[trade.symbol]?.price || trade.entry_price
            const pnlPts = trade.direction === 'BUY' ? exitP - trade.entry_price : trade.entry_price - exitP
            const pnlPct = (pnlPts / trade.entry_price) * 100
            await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: trade.id, status: pnlPts >= 0 ? 'WIN' : 'LOSS',
                exit_price: exitP, exit_reason: '24H_EXPIRED', pnl_points: parseFloat(pnlPts.toFixed(4)), pnl_pct: parseFloat(pnlPct.toFixed(4)) })
            })
            console.log(`[PaperMonitor] Crypto 24h close: ${trade.symbol} ${pnlPts.toFixed(2)} pts`)
            continue
          }
        }

        // Use pre-fetched prices (no extra API call per trade)
        const currentPrice = allPrices[trade.symbol]?.price || null

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
          const exitPrice = slHit ? trade.stop_loss : trade.target
          const pnlPoints = trade.direction === 'BUY'
            ? exitPrice - trade.entry_price
            : trade.entry_price - exitPrice
          const pnlPct = (pnlPoints / trade.entry_price) * 100

          await fetch(`${CONFIG.DASHBOARD_URL}/api/paper-trades`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: trade.id,
              status:     tgtHit ? 'WIN' : 'LOSS',
              exit_price:  exitPrice,
              exit_reason: tgtHit ? 'TARGET_HIT' : 'SL_HIT',
              pnl_points:  parseFloat(pnlPoints.toFixed(2)),
              pnl_pct:     parseFloat(pnlPct.toFixed(4)),
            })
          })

          // Send Telegram notification
          const emoji = tgtHit ? '🎯' : '🛑'
          const msg = `${emoji} <b>PAPER TRADE ${tgtHit?'WIN':'LOSS'}</b>
${trade.direction} ${trade.symbol} (${trade.strategy})
Entry: ₹${trade.entry_price} → Exit: ₹${exitPrice}
P&L: ${pnlPoints >= 0?'+':''}${pnlPoints.toFixed(0)} pts (${pnlPct >= 0?'+':''}${pnlPct.toFixed(2)}%)
Reason: ${tgtHit ? 'Target hit ✅' : 'Stop loss hit ❌'}`
          await sendTelegram(msg)
          console.log(`[PaperMonitor] ${tgtHit?'WIN':'LOSS'}: ${trade.symbol} ${pnlPoints.toFixed(0)} pts`)
        }
      } catch(e) {
        console.error(`[PaperMonitor] Error on trade ${trade.id}:`, e.message)
      }
    }
  } catch(e) {
    console.error('[PaperMonitor] Error:', e.message)
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

  // Morning briefing — 9:00 AM IST weekdays
  if (isWkday && h===9 && m===0 && lastBriefDate!==dateStr) {
    lastBriefDate = dateStr
    await sendMorningBriefing()
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
    console.log(`[Worker] Outbound IP: ${d.ip}`)
    sendTelegram(`🌐 Railway IP: <code>${d.ip}</code>
Whitelist this on Delta Exchange API key.`).catch(()=>{})
  }).catch(()=>{})

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
setInterval(() => tick().catch(console.error), 30000)

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
