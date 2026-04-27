// pages/api/ai-analysis.js
// Claude AI as trading partner inside Projectzero
// Provides: signal analysis, morning briefing, post-trade review, chat

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body
  if (!type) return res.status(400).json({ error: 'type required' })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

  // Build the prompt based on analysis type
  let systemPrompt = `You are an expert algorithmic trading analyst integrated into Projectzero,
a personal algo trading dashboard for Jay Malamdi (Zerodha ID: FHP228) based in Ahmedabad, India.
Jay trades Indian markets (Nifty/BankNifty) with ₹10,000-25,000 capital.
He is building an emotion-free, logic-based trading system.
Be concise, specific, data-driven. No generic advice. Use INR (₹) for amounts.
Format responses with clear sections. Keep total response under 200 words unless it's a detailed analysis.`

  let userPrompt = ''

  switch (type) {

    // ── Signal Analysis ──────────────────────────────────────────
    case 'signal_analysis':
      userPrompt = `Analyse this trading signal for Jay:

Symbol: ${data.symbol}
Signal: ${data.signal}
Strategy: ${data.strategy}
Price: ₹${data.price}
Stop Loss: ₹${data.stopLoss || 'not set'}
Target: ₹${data.target || 'not set'}
RSI: ${data.rsi}
Confidence: ${data.confidence}%
Reason: ${data.reason}
Today: ${data.today} (${data.marketContext?.note || ''})

Recent trade performance: ${data.recentPerformance || 'no data yet'}
Capital: ₹${data.capital || '25000'}

Provide:
1. WHY this signal fired (explain the key conditions in plain English)
2. QUALITY assessment (is this a strong or weak setup?)
3. KEY RISK (what could go wrong?)
4. SUGGESTED ACTION (execute / wait / skip with brief reason)
Keep it under 150 words. Be direct.`
      break

    // ── Morning Briefing ─────────────────────────────────────────
    case 'morning_briefing':
      userPrompt = `Generate Jay's morning trading briefing for ${data.date} (${data.dayOfWeek}).

Market context:
- Nifty: ₹${data.niftyPrice} (${data.niftyChange})
- BankNifty: ₹${data.bankNiftyPrice} (${data.bankNiftyChange})
- Global cues: ${data.globalCues || 'check SGX Nifty'}
- Day of week insights: ${data.dayInsight}

Jay's recent P&L: ${data.recentPnL || 'starting fresh'}
Active strategies: PZ-ORB Filter, Tuesday Momentum, Gap & Fade, Weak Stock Swing

Provide a sharp morning briefing covering:
1. TODAY'S OUTLOOK (1 line — bullish/bearish/sideways)
2. BEST STRATEGY for today and why
3. KEY LEVELS to watch (support/resistance)
4. RISK LEVEL (low/medium/high) and max suggested capital deployment
5. ONE THING TO WATCH OUT FOR today

Keep it under 200 words. Write as if you're a trading desk analyst talking to a solo trader.`
      break

    // ── Post-Trade Analysis ──────────────────────────────────────
    case 'post_trade':
      userPrompt = `Review this completed trade for Jay:

Symbol: ${data.symbol}
Direction: ${data.direction}
Strategy: ${data.strategy}
Entry: ₹${data.entryPrice}
Exit: ₹${data.exitPrice}
P&L: ₹${data.pnl} (${data.pnlPct}%)
Exit reason: ${data.exitReason}
Duration: ${data.duration}

Recent trade history: ${data.recentTrades || 'first trade'}

Provide:
1. VERDICT (worked as expected / partial success / failed — one line)
2. WHAT WORKED (or didn't)
3. ONE LESSON from this trade
4. STRATEGY STATUS (performing well / needs review / skip for now)

Be direct. Under 120 words.`
      break

    // ── AI Chat ──────────────────────────────────────────────────
    case 'chat':
      systemPrompt += ` The user's portfolio context:
- Capital: ₹${data.capital || '25000'}
- Recent trades: ${data.recentTrades || 'none yet'}
- Active strategies: PZ-ORB, Tuesday Momentum, Gap & Fade, Weak Stock Swing
- Markets: Indian (Zerodha), adding Crypto (Binance) soon
Answer trading questions with specific, actionable insight. Reference Jay's actual data when available.`
      userPrompt = data.message
      break

    // ── Market Regime Detection ──────────────────────────────────
    case 'market_regime':
      userPrompt = `Detect the current market regime for Indian markets:

Nifty 50 data:
- Current: ₹${data.niftyPrice}
- 3-month return: ${data.nifty3m || '-5%'} (bearish recent trend)
- RSI: ${data.niftyRsi || 'unknown'}
- Today's move: ${data.niftyChange}

BankNifty:
- Current: ₹${data.bankNiftyPrice}  
- Today's move: ${data.bankNiftyChange}

Classify the regime as one of:
- TRENDING UP (strong bullish momentum)
- TRENDING DOWN (strong bearish momentum)  
- SIDEWAYS (range-bound, choppy)
- HIGH VOLATILITY (large swings, unpredictable)
- LOW VOLATILITY (tight range, good for mean reversion)

Then recommend:
1. Which of Jay's 4 strategies works BEST in this regime
2. Which to AVOID today
3. Suggested position size (% of capital): conservative/normal/aggressive

Under 100 words.`
      break

    // ── Daily Summary ────────────────────────────────────────────
    case 'daily_summary':
      userPrompt = `Write Jay's end-of-day trading summary for ${data.date}:

Today's trades: ${JSON.stringify(data.trades || [])}
Total P&L: ₹${data.totalPnL || 0}
Wins: ${data.wins || 0} | Losses: ${data.losses || 0}
Best trade: ${data.bestTrade || 'none'}
Worst trade: ${data.worstTrade || 'none'}

Market performance today:
- Nifty: ${data.niftyPerf || 'unknown'}
- BankNifty: ${data.bankNiftyPerf || 'unknown'}

Weekly P&L so far: ₹${data.weeklyPnL || 0}

Write a concise daily summary covering:
1. TODAY'S PERFORMANCE (one line verdict)
2. STRATEGY PERFORMANCE (which worked, which didn't)
3. KEY OBSERVATION from today's market
4. TOMORROW'S OUTLOOK and recommended approach
5. MOTIVATION (one line — honest, not generic)

Under 200 words. Tone: like a trusted trading mentor.`
      break

    default:
      return res.status(400).json({ error: `Unknown type: ${type}` })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    const aiData = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', aiData)
      return res.status(500).json({ error: 'AI analysis unavailable', details: aiData })
    }

    const text = aiData.content?.[0]?.text || ''
    return res.status(200).json({ analysis: text, type, tokens: aiData.usage })

  } catch (err) {
    console.error('AI analysis error:', err)
    return res.status(500).json({ error: err.message })
  }
}
