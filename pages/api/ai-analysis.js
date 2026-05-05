// /api/ai-analysis
// Smart model routing:
// - Opus 4.5  → deep pre-trade analysis, morning intelligence (high stakes)
// - Sonnet    → signal analysis (medium complexity)
// - Haiku     → chat, quick queries (fast + cheap)
// All results cached in Supabase — never re-run for same input

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

// Model routing based on task importance
const MODELS = {
  deep:   'claude-opus-4-5',          // Deep pre-trade + morning brief
  medium: 'claude-sonnet-4-5-20251001', // Signal analysis
  fast:   'claude-haiku-4-5-20251001',  // Chat, quick queries
}

async function callClaude(prompt, tier = 'medium', maxTokens = 800) {
  const model = MODELS[tier] || MODELS.medium
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) {
    const err = await r.text()
    console.error(`Claude ${tier} (${model}) error:`, r.status, err.slice(0, 200))
    return ''
  }
  const d = await r.json()
  if (d.error) { console.error('Claude error:', d.error); return '' }
  return d?.content?.[0]?.text || ''
}

async function getFromCache(key) {
  try {
    const { data } = await sb.from('ai_cache').select('analysis,created_at').eq('cache_key', key).single()
    return data
  } catch { return null }
}

async function saveToCache(key, type, analysis, metadata = {}, expiresHours = null) {
  const expires_at = expiresHours ? new Date(Date.now() + expiresHours * 3600000).toISOString() : null
  try {
    await sb.from('ai_cache').upsert({
      cache_key: key, type, analysis, metadata, expires_at,
      created_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' })
  } catch(cachErr) { console.error('Cache save error:', cachErr.message) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const { type, data } = req.body
  if (!type) return res.status(400).json({ error: 'type required' })

  try {

    // ── 1. SIGNAL ANALYSIS (Sonnet — medium depth) ───────────────
    if (type === 'signal_analysis') {
      const { symbol, signal, strategy, price, confidence, stopLoss, target, rr, rsi, reason } = data
      const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `signal_${symbol}_${strategy}_${signal}_${dateStr}`

      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true, cachedAt: cached.created_at })

      const analysis = await callClaude(`You are a professional trading analyst for Jay (FHP228, Ahmedabad). Analyse this signal concisely.

Signal: ${signal} ${symbol}
Strategy: ${strategy}
Price: ${price} | Confidence: ${confidence}%
Stop Loss: ${stopLoss} | Target: ${target} | R:R: ${rr}
RSI: ${rsi} | Reason: ${reason}

Write exactly 4 sections:
1. WHY THIS SIGNAL — what the data says (2 sentences)
2. QUALITY CHECK — is this a good setup? What's missing? (1 sentence)
3. TRADE PLAN — specific entry, SL discipline, target approach (2 sentences)
4. KEY RISK — one thing that could invalidate this (1 sentence)

Be specific with numbers. Max 120 words total.`, 'medium', 450)

      await saveToCache(cacheKey, 'signal_analysis', analysis, { symbol, signal, strategy, price }, 20)
      return res.status(200).json({ analysis, cached: false })
    }

    // ── 2. DEEP PRE-TRADE ANALYSIS (Opus — maximum depth) ────────
    if (type === 'deep_analysis') {
      const { symbol, signal, strategy, price, stopLoss, target, rr, confidence,
              globalData, newsItems, rsi, atr, marketRegime } = data

      const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `deep_${symbol}_${strategy}_${signal}_${dateStr}`

      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true, tier: 'opus' })

      const newsText = (newsItems || []).slice(0, 5).map((n, i) => `${i+1}. [${n.timeAgo}] ${n.title}`).join('\n')
      const globalText = globalData ? `
Global context:
- S&P 500: ${globalData.sp500?.pct}% | NASDAQ: ${globalData.nasdaq?.pct}%
- VIX: ${globalData.vix?.price} | Crude: ${globalData.crude?.pct}%
- USD/INR: ${globalData.usdinr?.price} | DXY: ${globalData.dxy?.pct}%
- Market regime: ${marketRegime || 'unknown'}` : ''

      const analysis = await callClaude(`You are Jay's senior trading partner with 15 years of experience in Indian and crypto markets. Jay (FHP228, Ahmedabad) is about to execute a real trade. Give him a deep, honest pre-trade brief.

TRADE DETAILS:
Symbol: ${symbol} | Signal: ${signal}
Strategy: ${strategy} | Confidence: ${confidence}%
Entry: ${price} | Stop Loss: ${stopLoss} | Target: ${target}
R:R Ratio: ${rr} | RSI: ${rsi} | ATR: ${atr}

${globalText}

RECENT NEWS:
${newsText || 'No recent news'}

Write a deep pre-trade analysis covering:

## MARKET CONTEXT
What is happening with ${symbol} right now and why? How do global factors affect this trade today? (3-4 sentences)

## SIGNAL QUALITY
Is this genuinely a good setup or is it marginal? What makes you confident or cautious? Rate it 1-10 with reasoning. (3-4 sentences)

## RISK ASSESSMENT  
What specific events, levels, or factors could hurt this trade? What is the probability this works vs fails given current conditions? Be honest. (3-4 sentences)

## TRADE EXECUTION PLAN
Exact entry advice (wait for confirmation or enter now?), stop loss management (trail or fixed?), target strategy (take partial profits?), position sizing recommendation given ₹25,000 capital. (4-5 sentences)

## VERDICT
One clear sentence: TRADE IT / WAIT / AVOID — with the single most important reason.

Be brutally honest. Jay's money is at stake. Max 350 words.`, 'deep', 1000)

      await saveToCache(cacheKey, 'deep_analysis', analysis, { symbol, signal, strategy }, 18)
      return res.status(200).json({ analysis, cached: false, tier: 'opus' })
    }

    // ── 3. MORNING INTELLIGENCE (Opus — deep market brief) ───────
    if (type === 'morning_briefing') {
      const { date, dayOfWeek, globalData, signals, fearGreed } = data
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `morning_briefing_${today}`

      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true })

      const g = globalData || {}
      const analysis = await callClaude(`You are Jay's personal trading intelligence system. Today is ${dayOfWeek}, ${date}.

OVERNIGHT GLOBAL DATA:
S&P 500: ${g.sp500?.price} (${g.sp500?.pct}%)
NASDAQ: ${g.nasdaq?.price} (${g.nasdaq?.pct}%)
VIX Fear Index: ${g.vix?.price} ${g.vix?.price > 25 ? '⚠️ HIGH FEAR' : ''}
Crude Oil: $${g.crude?.price} (${g.crude?.pct}%)
Gold: $${g.gold?.price} (${g.gold?.pct}%)
USD/INR: ${g.usdinr?.price}
Dollar Index: ${g.dxy?.price} (${g.dxy?.pct}%)
Nikkei: ${g.nikkei?.pct}% | Hang Seng: ${g.hangseng?.pct}%
Bitcoin: $${g.btc?.price} (${g.btc?.pct}%)
Fear & Greed: ${fearGreed?.value}/100 (${fearGreed?.label})

Write Jay's morning trading brief:

## 🌍 OVERNIGHT SUMMARY
What happened globally and what does it mean for Indian markets opening today? (3 sentences)

## 📊 INDIA OUTLOOK  
How will NIFTY likely open? Which sectors look strong or weak? Key levels to watch. (3 sentences)

## 🎯 TODAY'S GAME PLAN
${dayOfWeek === 'Tuesday' ? 'TUESDAY — historically best day (+0.97% BankNifty avg). ' : ''}Which specific strategies to use today and why. Concrete setups to watch for. (4 sentences)

## ⚠️ RISKS TODAY
Two specific things that could hurt trades today. (2 sentences)

## 💡 EDGE
One high-probability opportunity based on all data above. (2 sentences)

Be specific with numbers and actionable. Max 280 words.`, 'deep', 900)

      await saveToCache(cacheKey, 'morning_briefing', analysis, {}, 20)

      // Save to daily reports
      const reportDate = new Date().toISOString().split('T')[0]
      await sb.from('daily_reports').upsert({
        report_date: reportDate, morning_brief: analysis,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'report_date' }).catch(() => {})

      return res.status(200).json({ analysis, cached: false, tier: 'opus' })
    }

    // ── 4. POST-TRADE ANALYSIS (Sonnet) ──────────────────────────
    if (type === 'post_trade') {
      const { tradeId, symbol, direction, entryPrice, exitPrice, pnl, strategy, duration } = data
      const cacheKey = `post_trade_${tradeId}`
      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true })

      const isWin = pnl > 0
      const pctMove = exitPrice ? (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2) : 0
      const analysis = await callClaude(`You are Jay's trading coach. Analyse this completed trade honestly.

Trade: ${direction} ${symbol} via ${strategy}
Entry: ${entryPrice} → Exit: ${exitPrice}
P&L: ${pnl > 0 ? '+' : ''}${pnl} (${pctMove}%)
Duration: ${duration || 'intraday'}
Result: ${isWin ? '✅ WIN' : '❌ LOSS'}

Write a post-trade review:
1. WHAT WENT ${isWin ? 'RIGHT' : 'WRONG'}: Why did this ${isWin ? 'work' : 'fail'}? (2 sentences)
2. PROCESS CHECK: Was this trade taken correctly per the strategy rules? (1 sentence)
3. LESSON: One specific thing to remember next time. (1 sentence)
4. NEXT TRADE: One adjustment to make this setup better. (1 sentence)

Max 100 words. Be honest and constructive.`, 'medium', 350)

      await saveToCache(cacheKey, 'post_trade', analysis, { tradeId, symbol, pnl }, null)

      if (tradeId) {
        await sb.from('trades').update({
          ai_analysis: analysis, ai_analysed_at: new Date().toISOString(),
        }).eq('id', tradeId).catch(() => {})
      }
      return res.status(200).json({ analysis, cached: false })
    }

    // ── 5. DAILY SUMMARY (Sonnet) ─────────────────────────────────
    if (type === 'daily_summary') {
      const { date, trades, totalPnL, wins, losses } = data
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `daily_summary_${today}`
      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true })

      const analysis = await callClaude(`Jay's trading summary for ${date}.
Trades: ${trades?.length || 0} | Wins: ${wins} | Losses: ${losses} | P&L: ${totalPnL > 0 ? '+' : ''}₹${totalPnL}

Write a 3-part summary (80 words max):
1. TODAY'S PERFORMANCE: Brief honest assessment
2. KEY LESSON: One specific takeaway
3. TOMORROW: What to focus on

Be direct and forward-looking.`, 'medium', 250)

      await saveToCache(cacheKey, 'daily_summary', analysis, {}, 24)
      await sb.from('daily_reports').upsert({
        report_date: new Date().toISOString().split('T')[0],
        daily_summary: analysis, trades_today: trades?.length || 0, pnl_today: totalPnL || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'report_date' }).catch(() => {})

      return res.status(200).json({ analysis, cached: false })
    }

    // ── 6. CHAT (Haiku — fast responses) ─────────────────────────
    if (type === 'chat') {
      const { message, capital } = data
      const analysis = await callClaude(`You are Jay's trading assistant (FHP228, Ahmedabad, India). He trades NIFTY, BankNifty, crypto on Binance. Capital: ₹${capital || 25000}.

Question: ${message}

Answer specifically for Indian markets. Max 200 words.`, 'fast', 500)
      return res.status(200).json({ analysis, cached: false })
    }

    // ── 7. MARKET REGIME (Haiku) ──────────────────────────────────
    if (type === 'market_regime') {
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `market_regime_${today}`
      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true })

      const analysis = await callClaude(`Describe today's Indian market regime in 60 words. Data: ${JSON.stringify(data)}
Focus: trend direction, volatility, best strategy type. Be specific.`, 'fast', 180)

      await saveToCache(cacheKey, 'market_regime', analysis, {}, 12)
      return res.status(200).json({ analysis, cached: false })
    }

    return res.status(400).json({ error: `Unknown type: ${type}` })

  } catch (err) {
    console.error('AI analysis error:', err)
    return res.status(500).json({ error: err.message })
  }
}
