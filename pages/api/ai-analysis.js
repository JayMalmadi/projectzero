// /api/ai-analysis
// All Claude AI calls go through here
// CACHING: Results saved to Supabase, never re-run for same input
// POST-TRADE: Analysis saved directly to trade record

import { createClient } from '@supabase/supabase-js'
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

async function callClaude(prompt, maxTokens = 600) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) {
    const err = await r.text()
    console.error('Claude API error:', r.status, err.slice(0, 200))
    return ''
  }
  const d = await r.json()
  if (d.error) {
    console.error('Claude API error:', d.error)
    return ''
  }
  return d?.content?.[0]?.text || ''
}

async function getFromCache(key) {
  const { data } = await sb
    .from('ai_cache')
    .select('analysis, created_at')
    .eq('cache_key', key)
    .single()
  return data
}

async function saveToCache(key, type, analysis, metadata = {}, expiresHours = null) {
  const expires_at = expiresHours
    ? new Date(Date.now() + expiresHours * 3600000).toISOString()
    : null
  await sb.from('ai_cache').upsert({
    cache_key: key,
    type,
    analysis,
    metadata,
    expires_at,
    created_at: new Date().toISOString(),
  }, { onConflict: 'cache_key' })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { type, data } = req.body
  if (!type) return res.status(400).json({ error: 'type required' })

  try {

    // ── Signal Analysis ──────────────────────────────────────────
    if (type === 'signal_analysis') {
      const { symbol, signal, strategy, price, confidence, today } = data

      // Cache key: same signal on same day = same analysis
      const dateStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `signal_${symbol}_${strategy}_${signal}_${dateStr}`

      // Check cache first
      const cached = await getFromCache(cacheKey)
      if (cached) {
        return res.status(200).json({ analysis: cached.analysis, cached: true, cachedAt: cached.created_at })
      }

      // Not cached — call Claude
      const analysis = await callClaude(`You are a professional Indian stock/crypto market analyst. Give Jay (FHP228, Ahmedabad) a brief signal analysis.

Signal: ${signal} ${symbol}
Strategy: ${strategy}
Price: ${price}
Confidence: ${confidence}%
Day: ${today || 'today'}
Reason: ${data.reason || ''}
RSI: ${data.rsi || 'N/A'}
Stop Loss: ${data.stopLoss || 'N/A'}
Target: ${data.target || 'N/A'}
R:R: ${data.rr || 'N/A'}

Write a concise 4-part analysis:
1. WHY THIS SIGNAL: What does the data tell us? (2 sentences)
2. QUALITY: Is this a good setup? What could make it better? (1 sentence)
3. TRADE PLAN: Specific entry, SL management, target approach (2 sentences)
4. WATCH OUT: One key risk factor to monitor (1 sentence)

Max 120 words. Be specific and actionable.`, 400)

      // Save to cache (expires at midnight — same signal tomorrow gets fresh analysis)
      await saveToCache(cacheKey, 'signal_analysis', analysis, { symbol, signal, strategy, price, confidence }, 24)

      return res.status(200).json({ analysis, cached: false })
    }

    // ── Post-Trade Analysis ──────────────────────────────────────
    if (type === 'post_trade') {
      const { tradeId, symbol, direction, entryPrice, exitPrice, pnl, strategy, duration } = data

      // Cache by trade ID — never re-runs for same trade
      const cacheKey = `post_trade_${tradeId}`
      const cached = await getFromCache(cacheKey)
      if (cached) {
        return res.status(200).json({ analysis: cached.analysis, cached: true })
      }

      const isWin = pnl > 0
      const pctMove = exitPrice ? (((exitPrice - entryPrice) / entryPrice) * 100).toFixed(2) : 0

      const analysis = await callClaude(`You are Jay's trading coach. Analyse this completed trade.

Trade: ${direction} ${symbol}
Strategy: ${strategy}
Entry: ${entryPrice} | Exit: ${exitPrice || 'open'}
P&L: ${pnl > 0 ? '+' : ''}${pnl}
Move: ${pctMove}%
Duration: ${duration || 'unknown'}
Result: ${isWin ? '✅ WIN' : '❌ LOSS'}

Write a brief post-trade review:
1. WHAT WENT ${isWin ? 'RIGHT' : 'WRONG'}: Why did this trade ${isWin ? 'work' : 'fail'}? (2 sentences)
2. LESSON: One specific thing to remember for next time (1 sentence)
3. NEXT TIME: One adjustment to make this setup better (1 sentence)

Max 80 words. Be honest and constructive.`, 300)

      // Save to cache permanently (trade analysis never expires)
      await saveToCache(cacheKey, 'post_trade', analysis, { tradeId, symbol, pnl }, null)

      // Also save directly to trade record
      if (tradeId) {
        await sb.from('trades').update({
          ai_analysis: analysis,
          ai_analysed_at: new Date().toISOString(),
        }).eq('id', tradeId)
      }

      return res.status(200).json({ analysis, cached: false })
    }

    // ── Morning Briefing ─────────────────────────────────────────
    if (type === 'morning_briefing') {
      const { date, dayOfWeek, dayInsight, niftyPrice, niftyChange, bankNiftyPrice, bankNiftyChange } = data
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `morning_briefing_${today}`

      const cached = await getFromCache(cacheKey)
      if (cached) {
        return res.status(200).json({ analysis: cached.analysis, cached: true })
      }

      const analysis = await callClaude(`You are Jay's daily trading assistant (FHP228, Ahmedabad).
Write a brief morning trading briefing for ${dayOfWeek}, ${date}.

Market data:
- NIFTY: ${niftyPrice} (${niftyChange})
- BankNifty: ${bankNiftyPrice} (${bankNiftyChange})
- Day insight: ${dayInsight}

Cover in 100 words:
1. Market mood for today
2. Which 2 strategies to focus on and why  
3. One key level to watch
4. One risk to be aware of

Be specific and actionable for an Indian intraday trader.`, 350)

      // Save to daily_reports and cache
      await saveToCache(cacheKey, 'morning_briefing', analysis, {}, 24)
      await sb.from('daily_reports').upsert({
        report_date: new Date().toISOString().split('T')[0],
        morning_brief: analysis,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'report_date' })

      return res.status(200).json({ analysis, cached: false })
    }

    // ── Daily Summary ────────────────────────────────────────────
    if (type === 'daily_summary') {
      const { date, trades, totalPnL, wins, losses } = data
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `daily_summary_${today}`

      const cached = await getFromCache(cacheKey)
      if (cached) {
        return res.status(200).json({ analysis: cached.analysis, cached: true })
      }

      const analysis = await callClaude(`You are Jay's trading coach. Write a brief end-of-day summary.

Date: ${date}
Trades today: ${trades?.length || 0}
Wins: ${wins} | Losses: ${losses}
Total P&L: ${totalPnL > 0 ? '+' : ''}₹${totalPnL}

Write a 3-part summary in 80 words:
1. TODAY'S PERFORMANCE: How was the day overall?
2. KEY LESSON: One thing to take away from today
3. TOMORROW: What to focus on tomorrow

Be honest, brief, and forward-looking.`, 250)

      await saveToCache(cacheKey, 'daily_summary', analysis, {}, 24)
      await sb.from('daily_reports').upsert({
        report_date: new Date().toISOString().split('T')[0],
        daily_summary: analysis,
        trades_today: trades?.length || 0,
        pnl_today: totalPnL || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'report_date' })

      return res.status(200).json({ analysis, cached: false })
    }

    // ── Chat ─────────────────────────────────────────────────────
    if (type === 'chat') {
      // Chat is NOT cached — always fresh
      const { message, capital } = data
      const analysis = await callClaude(`You are Jay's personal trading assistant (FHP228, Ahmedabad, India).
He trades NIFTY, BankNifty and crypto on Binance. Capital: ₹${capital || 25000}.

User question: ${message}

Answer helpfully and specifically for Indian markets. Max 150 words.`, 400)

      return res.status(200).json({ analysis, cached: false })
    }

    // ── Market Regime ────────────────────────────────────────────
    if (type === 'market_regime') {
      const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
      const cacheKey = `market_regime_${today}`
      const cached = await getFromCache(cacheKey)
      if (cached) return res.status(200).json({ analysis: cached.analysis, cached: true })

      const analysis = await callClaude(`Briefly describe today's Indian market regime in 50 words. 
Data: ${JSON.stringify(data)}
Focus on: trend direction, volatility level, best strategy type for today.`, 150)

      await saveToCache(cacheKey, 'market_regime', analysis, {}, 12)
      return res.status(200).json({ analysis, cached: false })
    }

    return res.status(400).json({ error: `Unknown type: ${type}` })

  } catch (err) {
    console.error('AI analysis error:', err)
    return res.status(500).json({ error: err.message })
  }
}
