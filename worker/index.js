// Projectzero 24/7 Automation Worker
// Runs on Railway - monitors markets, fires signals, sends Telegram alerts

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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

async function postJSON(url, body, headers={}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const urlObj = new URL(url)
    const opts = {
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(data)
    req.end()
  })
}

// ── Telegram ───────────────────────────────────────────────────
async function sendTelegram(message) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Not configured yet:', message.slice(0, 50))
    return
  }
  try {
    await postJSON(
      `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: CONFIG.TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }
    )
    console.log('[Telegram] Sent:', message.slice(0, 50))
  } catch(e) {
    console.error('[Telegram] Error:', e.message)
  }
}

// ── Market monitoring ──────────────────────────────────────────
async function checkSignals() {
  const strategies = [
    { symbol:'NIFTY',     strategy:'pz-orb',       market:'india'  },
    { symbol:'BANKNIFTY', strategy:'pz-tuesday',    market:'india'  },
    { symbol:'BTC',       strategy:'momentum',      market:'crypto' },
    { symbol:'ETH',       strategy:'macd-cross',    market:'crypto' },
    { symbol:'SOL',       strategy:'rsi-reversal',  market:'crypto' },
  ]

  for (const s of strategies) {
    try {
      const apiPath = s.market === 'crypto'
        ? `/api/crypto-signals?symbol=${s.symbol}&strategy=${s.strategy}`
        : `/api/pz-strategies?symbol=${s.symbol}&strategy=${s.strategy}`

      const data = await fetchJSON(`${CONFIG.DASHBOARD_URL}${apiPath}`)

      if (data.signal && data.signal !== 'HOLD' && data.confidence >= 65) {
        const emoji  = data.signal === 'BUY' ? '🟢' : '🔴'
        const market = s.market === 'crypto' ? '🪙' : '🇮🇳'
        const price  = s.market === 'crypto'
          ? `$${Number(data.price).toLocaleString('en-US', {maximumFractionDigits:2})}`
          : `₹${Number(data.price).toLocaleString('en-IN', {maximumFractionDigits:2})}`

        const msg = `${emoji} <b>SIGNAL FIRED</b> ${market}
━━━━━━━━━━━━━━━━
<b>${data.signal} ${s.symbol}</b>
Price: ${price}
Stop Loss: ${data.stopLoss ? (s.market==='crypto'?'$':'₹')+data.stopLoss : '—'}
Target: ${data.target ? (s.market==='crypto'?'$':'₹')+data.target : '—'}
Strategy: ${s.strategy}
Confidence: ${data.confidence}%

<a href="${CONFIG.DASHBOARD_URL}/dashboard">Open Dashboard →</a>`

        await sendTelegram(msg)
        console.log(`[Signal] ${data.signal} ${s.symbol} @ ${price} (${data.confidence}%)`)
      }
    } catch(e) {
      console.error(`[Signal] Error checking ${s.symbol}:`, e.message)
    }

    // Small delay between checks to avoid rate limits
    await new Promise(r => setTimeout(r, 2000))
  }
}

// ── Market hours check ─────────────────────────────────────────
function isIndianMarketOpen() {
  const now = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
  const day = now.getDay()   // 0=Sun, 6=Sat
  const h   = now.getHours()
  const m   = now.getMinutes()
  const mins = h * 60 + m
  // Mon-Fri, 9:15 AM to 3:30 PM IST
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930
}

// ── Morning briefing ───────────────────────────────────────────
async function sendMorningBriefing() {
  try {
    const now  = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const day  = days[now.getDay()]

    const r = await postJSON(`${CONFIG.DASHBOARD_URL}/api/ai-analysis`, {
      type: 'morning_briefing',
      data: {
        date:       now.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}),
        dayOfWeek:  day,
        dayInsight: now.getDay()===2 ? 'Tuesday — best day (+0.97% BankNifty avg)' :
                    now.getDay()===3 ? 'Wednesday — second best' :
                    now.getDay()===1 ? 'Monday — weak day' : 'Standard day',
        niftyPrice:'—', niftyChange:'—',
        bankNiftyPrice:'—', bankNiftyChange:'—',
      }
    })

    if (r.analysis) {
      await sendTelegram(`☀️ <b>PROJECTZERO MORNING BRIEFING</b>\n${day}\n━━━━━━━━━━━━━━━━\n${r.analysis.slice(0,800)}`)
    }
  } catch(e) {
    console.error('[Briefing] Error:', e.message)
  }
}

// ── Daily P&L summary ──────────────────────────────────────────
async function sendDailySummary() {
  try {
    await sendTelegram(`📊 <b>PROJECTZERO DAILY SUMMARY</b>\nMarket closed for today.\nCheck your trade history: <a href="${CONFIG.DASHBOARD_URL}/dashboard">Dashboard →</a>`)
  } catch(e) {
    console.error('[Summary] Error:', e.message)
  }
}

// ── Scheduler ─────────────────────────────────────────────────
let lastBriefingDate = ''
let lastSummaryDate  = ''
let signalCheckCount = 0

async function tick() {
  const now = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
  const h   = now.getHours()
  const m   = now.getMinutes()
  const dateStr = now.toDateString()
  const day     = now.getDay()
  const isWeekday = day >= 1 && day <= 5

  // Morning briefing at 9:00 AM IST (weekdays only)
  if (isWeekday && h === 9 && m === 0 && lastBriefingDate !== dateStr) {
    lastBriefingDate = dateStr
    console.log('[Scheduler] Sending morning briefing...')
    await sendMorningBriefing()
  }

  // Daily summary at 3:35 PM IST (weekdays only)
  if (isWeekday && h === 15 && m === 35 && lastSummaryDate !== dateStr) {
    lastSummaryDate = dateStr
    console.log('[Scheduler] Sending daily summary...')
    await sendDailySummary()
  }

  // Check signals every 30 seconds during market hours
  // For crypto: check every 60 seconds (24/7)
  signalCheckCount++

  const checkIndian = isIndianMarketOpen() && signalCheckCount % 2 === 0  // every ~60s
  const checkCrypto = signalCheckCount % 4 === 0  // every ~120s

  if (checkIndian || checkCrypto) {
    await checkSignals()
  }
}

// ── Health check server ────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type': 'application/json'})
    res.end(JSON.stringify({
      status:  'ok',
      worker:  'projectzero-automation',
      time:    new Date().toISOString(),
      market:  isIndianMarketOpen() ? 'OPEN' : 'CLOSED',
      checks:  signalCheckCount,
      telegram: !!CONFIG.TELEGRAM_BOT_TOKEN,
    }))
  } else {
    res.writeHead(200, {'Content-Type': 'text/plain'})
    res.end('Projectzero Worker Running')
  }
})

server.listen(CONFIG.PORT, () => {
  console.log(`[Worker] Projectzero automation started on port ${CONFIG.PORT}`)
  console.log(`[Worker] Dashboard: ${CONFIG.DASHBOARD_URL}`)
  console.log(`[Worker] Telegram: ${CONFIG.TELEGRAM_BOT_TOKEN ? 'Configured' : 'Not configured yet'}`)
})

// ── Start ticking ──────────────────────────────────────────────
console.log('[Worker] Starting signal monitoring...')
sendTelegram('🚀 <b>Projectzero Worker Started</b>\n24/7 monitoring active.\nIndian markets + Crypto tracked.').catch(()=>{})

// Run immediately then every 30 seconds
tick().catch(console.error)
setInterval(() => tick().catch(console.error), 30000)

console.log('[Worker] Running. Checking signals every 30 seconds.')
