// /api/morning-intelligence
// Generated ONCE per day - cached in Supabase
// Returns cached version on subsequent calls same day
// Only regenerates if: new day OR ?force=1
// Morning brief — Claude analyses global market data
// and generates a specific trading plan for NIFTY, BANKNIFTY, FINNIFTY + BTC/ETH/SOL/XRP
// Called once at market open, cached for the session

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

export default async function handler(req, res) {
  const force = req.query.force === '1'
  const today = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'})).toISOString().split('T')[0]

  // ── Check cache first ─────────────────────────────────────────
  if (!force) {
    try {
      const { data: cached } = await sb
        .from('morning_brief_cache')
        .select('*')
        .eq('id', 'current')
        .single()

      if (cached && cached.date === today) {
        console.log('[MorningBrief] Serving from cache for', today)
        return res.status(200).json({
          status:          'success',
          date:            cached.date,
          cached:          true,
          indiaBrief:      cached.india_brief,
          cryptoBrief:     cached.crypto_brief,
          rawData:         cached.raw_data || {},
          topNews:         cached.top_news || [],
          generatedAt:     cached.generated_at,
        })
      }
    } catch(e) {
      console.warn('[MorningBrief] Cache read failed:', e.message)
    }
  }

  console.log('[MorningBrief] Generating fresh brief for', today)

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

  try {
    const baseUrl = process.env.DASHBOARD_URL || 'https://projectzero-psi.vercel.app'

    // Fetch global data in parallel
    const [pulseRes, fngRes] = await Promise.all([
      fetch(`${baseUrl}/api/global-pulse`).then(r => r.json()).catch(() => ({})),
      fetch('https://api.alternative.me/fng/?limit=3').then(r => r.json()).catch(() => ({})),
    ])

    const p           = pulseRes.pulse || {}
    const fearGreed   = fngRes?.data?.[0] || {}
    const now         = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const dow         = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]
    const dateStr     = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    const fmt         = (x, curr='') => x ? `${curr}${x.price} (${x.pct >= 0 ? '+' : ''}${x.pct}%)` : 'N/A'

    const dowInsight = now.getDay() === 2
      ? 'Tuesday historically best day for BankNifty (+0.97% avg) — momentum trades work well'
      : now.getDay() === 3 ? 'Wednesday second best day — watch for trend continuation'
      : now.getDay() === 1 ? 'Monday historically weakest — trade smaller, be selective'
      : now.getDay() === 5 ? 'Friday tends flat-to-down — reduce size, no overnight positions'
      : 'Mid-week standard trading day'

    const globalContext = `
TODAY: ${dow}, ${dateStr} | ${dowInsight}

US MARKETS (prev session):
S&P 500: ${fmt(p.us?.sp500)} | NASDAQ: ${fmt(p.us?.nasdaq)} | Dow: ${fmt(p.us?.dow)}
VIX: ${p.us?.vix?.price || 'N/A'} ${(p.us?.vix?.price > 25) ? '⚠️ HIGH FEAR' : (p.us?.vix?.price > 20) ? 'Elevated' : 'Normal'}
US 10Y Yield: ${p.us?.yield10y?.price || 'N/A'}%

INDIA (prev close):
NIFTY: ${fmt(p.india?.nifty, '₹')} | BankNifty: ${fmt(p.india?.banknifty, '₹')} | SENSEX: ${fmt(p.india?.sensex, '₹')}
USD/INR: ${fmt(p.india?.usdinr)} | SGX Nifty: ${p.india?.sgxNifty ? fmt(p.india.sgxNifty) : 'N/A'}

COMMODITIES:
Crude WTI: ${fmt(p.commodities?.crude, '$')} | Brent: ${fmt(p.commodities?.brent, '$')}
Gold: ${fmt(p.commodities?.gold, '$')} | Nat Gas: ${fmt(p.commodities?.natgas, '$')}

CURRENCIES:
DXY: ${fmt(p.currencies?.dxy)} | EUR/USD: ${fmt(p.currencies?.eurusd)} | USD/JPY: ${fmt(p.currencies?.usdjpy)}

ASIAN MARKETS:
Nikkei: ${fmt(p.asia?.nikkei)} | Hang Seng: ${fmt(p.asia?.hangseng)} | Shanghai: ${fmt(p.asia?.shanghai)}

CRYPTO:
BTC: ${fmt(p.crypto?.btc, '$')} | ETH: ${fmt(p.crypto?.eth, '$')}
Fear & Greed: ${fearGreed.value || 'N/A'}/100 (${fearGreed.value_classification || 'N/A'})

GLOBAL SIGNALS:
${pulseRes.signals?.map(s => `${s.factor}: ${s.value} → ${s.note}`).join('\n') || 'No major signals'}

RECENT NEWS:
${pulseRes.news?.slice(0, 8).map((n, i) => `${i+1}. [${n.timeAgo}] ${n.title}`).join('\n') || 'No news'}
`

    // India morning brief prompt
    const indiaPrompt = `You are Jay's personal trading partner. Jay trades NIFTY, BANKNIFTY, and FINNIFTY futures and options from Ahmedabad.

GLOBAL MARKET DATA:
${globalContext}

Write Jay's INDIAN MARKET MORNING BRIEF for ${dow}, ${dateStr}.

🌍 GLOBAL OVERNIGHT SUMMARY
[2-3 sentences: What happened globally. Overall mood going into Indian open.]

📊 INDIA MARKET OUTLOOK  
[NIFTY likely open: gap up/down by how much? Which direction today — bullish/bearish/rangebound? BankNifty vs FINNIFTY — which is stronger?]

🎯 TODAY'S TRADING PLAN
[Specific: What price action on NIFTY/BANKNIFTY/FINNIFTY would signal a long vs short entry? What levels matter? Risk-reward on each setup.]

📌 KEY LEVELS
[NIFTY support/resistance, BankNifty support/resistance, FINNIFTY key level]

⚠️ KEY RISKS
[2 specific things that could invalidate the day's setup]

💡 HIGHEST PROBABILITY SETUP
[The single best setup for today — specific instrument, direction, entry trigger, level]

Max 300 words. Specific and actionable.`

    // Crypto brief prompt
    const cryptoPrompt = `You are Jay's crypto trading partner. Jay trades BTC, ETH, SOL, XRP perpetual futures on Delta Exchange India.

GLOBAL DATA:
BTC: ${fmt(p.crypto?.btc, '$')} | ETH: ${fmt(p.crypto?.eth, '$')}
Fear & Greed: ${fearGreed.value || 'N/A'}/100 (${fearGreed.value_classification || 'N/A'})
US Markets: S&P ${fmt(p.us?.sp500)} | VIX ${p.us?.vix?.price || 'N/A'}
DXY: ${fmt(p.currencies?.dxy)}
Crypto news: ${pulseRes.news?.filter(n => n.title.toLowerCase().match(/crypto|bitcoin|btc|eth|sol/)).slice(0, 3).map(n => `[${n.timeAgo}] ${n.title}`).join(' | ') || 'None'}

Write Jay's CRYPTO BRIEF for today.

🪙 CRYPTO OVERVIEW
[2 sentences: Current market state, key driver]

🎯 BEST SETUP TODAY
[Which of BTC/ETH/SOL/XRP looks strongest + specific entry trigger and level]

⚠️ AVOID
[1-2 things to avoid today in crypto]

Max 120 words. Specific.`

    // Call Claude for both briefs in parallel
    const [indiaRes, cryptoRes] = await Promise.all([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: indiaPrompt }] })
      }).then(r => r.json()),
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: cryptoPrompt }] })
      }).then(r => r.json()),
    ])

    const indiaBrief  = indiaRes?.content?.[0]?.text  || 'India brief unavailable'
    const cryptoBrief = cryptoRes?.content?.[0]?.text || 'Crypto brief unavailable'
    const rawData = { us:p.us, india:p.india, commodities:p.commodities,
                      currencies:p.currencies, asia:p.asia, crypto:p.crypto, fearGreed }
    const topNews = pulseRes.news?.slice(0, 8) || []

    // ── Save to cache ───────────────────────────────────────────
    try {
      await sb.from('morning_brief_cache').upsert({
        id:           'current',
        date:         today,
        india_brief:  indiaBrief,
        crypto_brief: cryptoBrief,
        raw_data:     rawData,
        top_news:     topNews,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      console.log('[MorningBrief] Cached for', today)
    } catch(e) {
      console.warn('[MorningBrief] Cache save failed:', e.message)
    }

    return res.status(200).json({
      status:          'success',
      date:            dateStr,
      day:             dow,
      cached:          false,
      globalSentiment: pulseRes.globalSentiment,
      keySignals:      pulseRes.signals || [],
      indiaBrief,
      cryptoBrief,
      rawData,
      topNews,
      generatedAt:     new Date().toISOString(),
    })

  } catch(err) {
    console.error('[MorningIntelligence] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
