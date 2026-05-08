// /api/market-regime
// Analyses current market condition: Trending/Sideways/Volatile
// Tells you which strategies work best right now

export default async function handler(req, res) {
  try {
    // Fetch NIFTY + BankNifty data
    const [rN, rB, rB2] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=15m&range=5d'),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=15m&range=5d'),
      fetch('https://api.alternative.me/fng/?limit=7'),
    ])

    const dN  = await rN.json()
    const dB  = await rB.json()
    const fng = await rB2.json().catch(() => ({ data: [] }))

    const niftyResult = dN?.chart?.result?.[0]
    const bankResult  = dB?.chart?.result?.[0]

    if (!niftyResult) throw new Error('No NIFTY data')

    const nClose  = niftyResult.indicators.quote[0].close.filter(Boolean)
    const nHigh   = niftyResult.indicators.quote[0].high.filter(Boolean)
    const nLow    = niftyResult.indicators.quote[0].low.filter(Boolean)
    const nVol    = niftyResult.indicators.quote[0].volume.filter(Boolean)
    const bClose  = bankResult?.indicators?.quote?.[0]?.close?.filter(Boolean) || []

    const price   = nClose[nClose.length - 1]
    const prev    = nClose[nClose.length - 2]

    // EMA
    function ema(data, p) {
      const k = 2 / (p + 1)
      let v = data.slice(0, p).reduce((a, b) => a + b, 0) / p
      for (let i = p; i < data.length; i++) v = data[i] * k + v * (1 - k)
      return v
    }

    // ATR for volatility
    const trs = []
    for (let i = 1; i < nClose.length; i++) {
      trs.push(Math.max(nHigh[i] - nLow[i], Math.abs(nHigh[i] - nClose[i-1]), Math.abs(nLow[i] - nClose[i-1])))
    }
    const atr    = trs.slice(-14).reduce((a, b) => a + b, 0) / 14
    const atrPct = (atr / price) * 100

    const ema9  = ema(nClose, 9)
    const ema21 = ema(nClose, 21)
    const ema50 = ema(nClose, 50)

    // Price range over last 5 days
    const last5High = Math.max(...nHigh.slice(-26))
    const last5Low  = Math.min(...nLow.slice(-26))
    const rangeAsPct = ((last5High - last5Low) / last5Low) * 100

    // Volume trend
    const volAvg   = nVol.slice(-20).reduce((a, b) => a + b, 0) / 20
    const volNow   = nVol[nVol.length - 1] || 0
    const volRatio = volNow / (volAvg || 1)

    // Trend strength
    const emaTrend = ema9 > ema21 && ema21 > ema50 ? 'STRONG_UP'
                   : ema9 < ema21 && ema21 < ema50 ? 'STRONG_DOWN'
                   : ema9 > ema21 ? 'WEAK_UP'
                   : 'WEAK_DOWN'

    const dayChange = ((price - nClose[nClose.length - 26]) / nClose[nClose.length - 26]) * 100

    // Determine regime
    let regime, regimeEmoji, color, description, bestStrategies, avoidStrategies

    if (atrPct > 0.8 && rangeAsPct > 2.5) {
      regime = 'HIGH VOLATILITY'
      regimeEmoji = '⚡'
      color = '#f59e0b'
      description = `NIFTY moving ${rangeAsPct.toFixed(1)}% range over 5 days. ATR ${atrPct.toFixed(2)}% — high risk. Widen stops or reduce size.`
      bestStrategies = ['PZ-ORB Filter', 'Bollinger Breakout', 'MACD Crossover']
      avoidStrategies = ['VWAP Reversion', 'Gap & Fade']
    } else if (emaTrend === 'STRONG_UP' && dayChange > 0.3) {
      regime = 'TRENDING UP'
      regimeEmoji = '📈'
      color = '#10b981'
      description = `EMA9 > EMA21 > EMA50 — clean uptrend. Price +${dayChange.toFixed(1)}% today. Momentum strategies work best.`
      bestStrategies = ['MACD Crossover', 'MACD Crossover', 'Tuesday Momentum']
      avoidStrategies = ['Gap & Fade (short)', 'RSI Reversal (sell)']
    } else if (emaTrend === 'STRONG_DOWN' && dayChange < -0.3) {
      regime = 'TRENDING DOWN'
      regimeEmoji = '📉'
      color = '#ef4444'
      description = `EMA9 < EMA21 < EMA50 — downtrend. Price ${dayChange.toFixed(1)}% today. Short bias or avoid longs.`
      bestStrategies = ['Weak Stock Swing', 'MACD Crossover (SELL)', 'MACD Crossover (SELL)']
      avoidStrategies = ['Tuesday Momentum (long)', 'VWAP (long)']
    } else {
      regime = 'SIDEWAYS'
      regimeEmoji = '〰️'
      color = '#6366f1'
      description = `EMAs clustered — no clear trend. Range ${rangeAsPct.toFixed(1)}% over 5 days. Reversion strategies work best.`
      bestStrategies = ['VWAP Reversion', 'Bollinger Bands', 'Gap & Fade']
      avoidStrategies = ['MACD Crossover', 'Tuesday Momentum']
    }

    // Fear & Greed
    const fngData    = fng?.data?.[0] || {}
    const fngValue   = parseInt(fngData.value || 50)
    const fngLabel   = fngData.value_classification || 'Neutral'
    const fngHistory = fng?.data?.slice(0, 7).map(d => ({
      value: parseInt(d.value), label: d.value_classification,
      date: new Date(parseInt(d.timestamp) * 1000).toLocaleDateString('en-IN', { weekday: 'short' })
    })) || []

    // Day of week insight
    const dow     = new Date().getDay()
    const dowName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow]
    const dayInsight = dow === 2 ? '📅 Tuesday — historically best day for BankNifty (+0.97% avg)'
                     : dow === 3 ? '📅 Wednesday — second best day (+0.54% avg)'
                     : dow === 1 ? '📅 Monday — weakest day historically. Trade cautiously.'
                     : dow === 5 ? '📅 Friday — tend to be flat/down. Avoid new positions.'
                     : `📅 ${dowName} — standard day`

    return res.status(200).json({
      status: 'success',
      regime, regimeEmoji, color, description,
      bestStrategies, avoidStrategies,
      metrics: {
        niftyPrice:  parseFloat(price.toFixed(1)),
        dayChange:   parseFloat(dayChange.toFixed(2)),
        atrPct:      parseFloat(atrPct.toFixed(3)),
        rangeAsPct:  parseFloat(rangeAsPct.toFixed(2)),
        emaTrend,
        volRatio:    parseFloat(volRatio.toFixed(2)),
        ema9:        parseFloat(ema9.toFixed(1)),
        ema21:       parseFloat(ema21.toFixed(1)),
        ema50:       parseFloat(ema50.toFixed(1)),
      },
      fearGreed: {
        value: fngValue, label: fngLabel,
        history: fngHistory,
        sentiment: fngValue < 25 ? 'Extreme Fear — contrarian BUY signal'
                 : fngValue < 45 ? 'Fear — cautious, watch for bounce'
                 : fngValue < 55 ? 'Neutral — no edge from sentiment'
                 : fngValue < 75 ? 'Greed — be careful with longs'
                 : 'Extreme Greed — contrarian SELL signal',
      },
      dayOfWeek: { name: dowName, insight: dayInsight, dow },
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Market regime error:', err)
    return res.status(500).json({ error: err.message })
  }
}
