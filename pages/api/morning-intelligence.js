// /api/morning-intelligence
// Full morning intelligence report — Claude analyses all global factors
// and generates a specific trading plan for the day
// Separate sections for Indian markets + Crypto

export default async function handler(req, res) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

  try {
    // ── Step 1: Fetch global pulse ────────────────────────────
    const baseUrl = process.env.DASHBOARD_URL || 'https://projectzero-psi.vercel.app'
    const pulseR  = await fetch(`${baseUrl}/api/global-pulse`)
    const pulse   = await pulseR.json()

    if (!pulse.pulse) throw new Error('Global pulse fetch failed')

    const p = pulse.pulse

    // ── Step 2: Fetch Fear & Greed ────────────────────────────
    const fngR = await fetch('https://api.alternative.me/fng/?limit=3')
    const fng  = await fngR.json().catch(() => ({}))
    const fearGreed = fng?.data?.[0] || {}

    // ── Step 3: Build context string for Claude ───────────────
    const now      = new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
    const dow      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]
    const dateStr  = now.toLocaleDateString('en-IN', {day:'2-digit', month:'long', year:'numeric'})

    const fmt = (x, curr='') => x ? `${curr}${x.price} (${x.pct > 0 ? '+' : ''}${x.pct}%)` : 'N/A'

    const globalContext = `
TODAY: ${dow}, ${dateStr} — Indian market opens in ~${Math.max(0, Math.round((9.25*60 - (now.getHours()*60+now.getMinutes())))).toFixed(0)} minutes

=== US MARKETS (closed last night) ===
S&P 500:    ${fmt(p.us?.sp500)}
NASDAQ:     ${fmt(p.us?.nasdaq)}
Dow Jones:  ${fmt(p.us?.dow)}
VIX (Fear): ${p.us?.vix?.price || 'N/A'} ${p.us?.vix?.price > 25 ? '⚠️ HIGH FEAR' : p.us?.vix?.price > 20 ? 'Elevated' : 'Normal'}
US 10Y Bond:${p.us?.yield10y?.price || 'N/A'}%

=== INDIAN PRE-MARKET ===
NIFTY (prev close): ${fmt(p.india?.nifty, '₹')}
BankNifty:          ${fmt(p.india?.banknifty, '₹')}
SENSEX:             ${fmt(p.india?.sensex, '₹')}
USD/INR:            ${fmt(p.india?.usdinr)}
SGX Nifty:          ${p.india?.sgxNifty ? fmt(p.india.sgxNifty) : 'N/A'}

=== COMMODITIES ===
Crude Oil (WTI): ${fmt(p.commodities?.crude, '$')}
Brent Crude:     ${fmt(p.commodities?.brent, '$')}
Gold:            ${fmt(p.commodities?.gold, '$')}
Natural Gas:     ${fmt(p.commodities?.natgas, '$')}

=== CURRENCIES ===
Dollar Index (DXY): ${fmt(p.currencies?.dxy)}
EUR/USD:            ${fmt(p.currencies?.eurusd)}
USD/JPY:            ${fmt(p.currencies?.usdjpy)}

=== ASIAN MARKETS (open/recent) ===
Nikkei 225:  ${fmt(p.asia?.nikkei)}
Hang Seng:   ${fmt(p.asia?.hangseng)}
Shanghai:    ${fmt(p.asia?.shanghai)}
KOSPI:       ${fmt(p.asia?.kospi)}

=== CRYPTO ===
Bitcoin: ${fmt(p.crypto?.btc, '$')}
Ethereum:${fmt(p.crypto?.eth, '$')}
Fear & Greed: ${fearGreed.value || 'N/A'}/100 (${fearGreed.value_classification || 'N/A'})

=== GLOBAL RISK SIGNALS ===
${pulse.signals?.map(s => `${s.factor}: ${s.value} → ${s.note}`).join('\n') || 'No major signals'}

=== RECENT MARKET-MOVING NEWS ===
${pulse.news?.slice(0, 10).map((n,i) => `${i+1}. [${n.timeAgo}] ${n.title}`).join('\n') || 'No news fetched'}
`

    // ── Step 4: Claude generates Indian market brief ──────────
    const indiaPrompt = `You are Jay's personal trading partner and market analyst. Jay (FHP228, Ahmedabad) is a self-taught Indian trader who trades NIFTY, BankNifty, and Indian stocks using custom algorithmic strategies.

Here is ALL the global market data for today:
${globalContext}

Write Jay's INDIAN MARKET MORNING BRIEF for ${dow}, ${dateStr}.

Structure it exactly like this:

🌍 GLOBAL OVERNIGHT SUMMARY
[2-3 sentences: What happened globally overnight. US markets, Asian session, key commodities. What is the overall global mood going into Indian open?]

📊 INDIA MARKET OUTLOOK
[2-3 sentences: Based on global cues, how will NIFTY likely open? Gap up or down? Which sectors look strong or weak today?]

🎯 TODAY'S TRADING PLAN
[Specific plan: Which of these strategies to focus on today: PZ-ORB Filter, Tuesday Momentum, Gap & Fade, Weak Stock Swing, VWAP, Bollinger, MACD. Give specific reasons based on today's data. Be very specific - e.g. "Gap & Fade likely if NIFTY opens +0.5% or more given overnight US rally"]

⚠️ KEY RISKS TODAY
[2 specific risk factors to watch — events, levels, or global factors that could hurt trades]

📌 LEVELS TO WATCH
[Give specific NIFTY and BankNifty support/resistance levels based on recent data]

💡 JAY'S EDGE TODAY
[1-2 sentences: What is the highest probability setup today based on all data? Be specific and actionable]

Day-of-week insight: ${now.getDay()===2?'Tuesday historically best day for BankNifty (+0.97% avg)':now.getDay()===3?'Wednesday second best day':now.getDay()===1?'Monday historically weakest day — trade smaller':now.getDay()===5?'Friday tends to be flat-to-down — avoid holding MIS overnight':'Standard trading day'}

Keep it concise, specific, and actionable. Jay reads this before market opens. Max 350 words.`

    // ── Step 5: Claude generates Crypto brief ─────────────────
    const cryptoPrompt = `You are Jay's crypto trading partner. Jay trades BTC, ETH, SOL, BNB, XRP on Binance using algorithmic strategies.

GLOBAL DATA:
Bitcoin: ${fmt(p.crypto?.btc, '$')}
Ethereum: ${fmt(p.crypto?.eth, '$')}
Fear & Greed: ${fearGreed.value || 'N/A'}/100 (${fearGreed.value_classification || 'N/A'})
US Markets: S&P ${fmt(p.us?.sp500)} | VIX ${p.us?.vix?.price || 'N/A'}
Dollar Index: ${fmt(p.currencies?.dxy)}
Recent news: ${pulse.news?.filter(n=>n.title.toLowerCase().includes('crypto')||n.title.toLowerCase().includes('bitcoin')||n.title.toLowerCase().includes('btc')).slice(0,4).map(n=>`[${n.timeAgo}] ${n.title}`).join(' | ') || 'No crypto-specific news'}

Write Jay's CRYPTO MARKET BRIEF for today.

Structure:
🪙 CRYPTO OVERVIEW
[2 sentences: Where is crypto right now? Bull/bear/sideways? Key factor driving it]

🎯 BEST OPPORTUNITIES TODAY
[Which coins and which strategies — EMA Momentum, MACD Cross, RSI Reversal, Bollinger Breakout — look most promising today and why]

⚠️ AVOID TODAY
[1-2 things to avoid in crypto today based on current conditions]

💡 TOP TRADE SETUP
[The single best crypto trade setup available right now based on data]

Max 150 words. Be specific with coin names and price levels.`

    // Use ai-analysis endpoint for Opus + caching
    const baseUrl2 = process.env.DASHBOARD_URL || 'https://projectzero-psi.vercel.app'
    const miR = await fetch(`${baseUrl2}/api/ai-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'morning_briefing',
        data: {
          date: dateStr, dayOfWeek: dow,
          globalData: {
            sp500:   p.us?.sp500,   nasdaq:  p.us?.nasdaq,
            vix:     p.us?.vix,     crude:   p.commodities?.crude,
            gold:    p.commodities?.gold, usdinr: p.currencies?.usdinr,
            dxy:     p.currencies?.dxy,  nikkei:  p.asia?.nikkei,
            hangseng:p.asia?.hangseng,   btc:     p.crypto?.btc,
          },
          fearGreed, signals: pulse.signals || [],
        }
      })
    })
    const miData = await miR.json()
    const indiaBrief  = miData.analysis || 'Indian market brief unavailable'

    // Crypto brief — separate call
    const cryptoR2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:400, messages:[{role:'user',content:cryptoPrompt}] })
    })
    const cryptoData2 = await cryptoR2.json()
    const cryptoBrief = cryptoData2?.content?.[0]?.text || 'Crypto brief unavailable'

    return res.status(200).json({
      status: 'success',
      date:   dateStr,
      day:    dow,
      globalSentiment: pulse.globalSentiment,
      keySignals: pulse.signals || [],
      indiaBrief,
      cryptoBrief,
      rawData: {
        us:          p.us,
        india:       p.india,
        commodities: p.commodities,
        currencies:  p.currencies,
        asia:        p.asia,
        crypto:      p.crypto,
        fearGreed,
      },
      topNews: pulse.news?.slice(0, 8) || [],
      generatedAt: new Date().toISOString(),
    })
  } catch(err) {
    console.error('Morning intelligence error:', err)
    return res.status(500).json({ error: err.message })
  }
}
