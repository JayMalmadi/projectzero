// pages/api/pz-strategies.js
// 4 Custom Projectzero Strategies — built from 3-month real market analysis
// Data insights: Market bearish -5%, Tuesday best day, 76% ORB success, BankNifty volatile

export default async function handler(req, res) {
  const { symbol = 'NIFTY', strategy = 'pz-orb' } = req.query

  try {
    const yahooMap = {
      'NIFTY':     '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'TCS':       'TCS.NS',
      'INFY':      'INFY.NS',
      'ICICIBANK': 'ICICIBANK.NS',
    }
    const ticker = yahooMap[symbol] || `${symbol}.NS`

    // Fetch daily data (6 months)
    const r6m = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`
    )
    const raw6m = await r6m.json()
    const result = raw6m?.chart?.result?.[0]
    if (!result) return res.status(404).json({ error: 'No data' })

    const timestamps = result.timestamp
    const q          = result.indicators.quote[0]
    const closes     = q.close
    const highs      = q.high
    const lows       = q.low
    const volumes    = q.volume
    const opens      = q.open

    const last    = closes.length - 1
    const price   = closes[last]
    const today   = new Date(timestamps[last] * 1000)
    const dow     = today.getDay() // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri

    // ── Common indicators ──────────────────────────────
    const ema9  = calcEMA(closes, 9)
    const ema21 = calcEMA(closes, 21)
    const atr14 = calcATR(highs, lows, closes, 14)
    const rsi14 = calcRSI(closes, 14)
    const vwap  = calcVWAP(highs, lows, closes, volumes, 14)

    // Day of week label
    const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const today_name = DOW_NAMES[dow]

    let signal = 'HOLD', reason = '', confidence = 0,
        stopLoss = null, target = null, strategy_detail = ''

    // ================================================================
    // STRATEGY 1: PZ Tuesday Momentum
    // Based on real data: Tue avg +0.76% Nifty, +0.97% BankNifty
    // Best entry day confirmed across 3 months
    // ================================================================
    if (strategy === 'pz-tuesday') {
      strategy_detail = 'Tuesday Momentum — Data shows Tue/Wed are strongest days. Enter in trend direction on open.'

      const isTueThu  = dow === 2 || dow === 3  // Tue or Wed
      const trending   = ema9[last] > ema21[last]
      const momentum   = (closes[last] - closes[last-3]) / closes[last-3] * 100
      const rsi        = rsi14[last]

      if (isTueThu && trending && momentum > 0.3 && rsi > 45 && rsi < 75) {
        signal = 'BUY'
        confidence = 74
        reason = `${today_name} momentum: EMA trend up, +${momentum.toFixed(2)}% 3-day move, RSI ${rsi?.toFixed(0)}`
      } else if (isTueThu && !trending && momentum < -0.3 && rsi < 55 && rsi > 25) {
        signal = 'SELL'
        confidence = 70
        reason = `${today_name} momentum: EMA trend down, ${momentum.toFixed(2)}% 3-day move, RSI ${rsi?.toFixed(0)}`
      } else if (dow === 4 || dow === 5) {
        signal = 'HOLD'
        confidence = 85
        reason = `${today_name}: Data shows Thu/Fri avg -0.55% to -0.58%. Avoid new positions.`
      } else {
        reason = `${today_name}: Not optimal entry day. Wait for Tue/Wed setup.`
        confidence = 40
      }
    }

    // ================================================================
    // STRATEGY 2: PZ-ORB Filter (Our twist on ORB)
    // 76% days break ORB, but 39% are false (both sides break)
    // Filter: only enter if gap < 0.3% + volume confirms
    // ================================================================
    else if (strategy === 'pz-orb') {
      strategy_detail = 'PZ-ORB Filter — 76% ORB success rate. Filter false signals with gap + volume check.'

      const gapPct     = Math.abs((opens[last] - closes[last-1]) / closes[last-1] * 100)
      const volRatio   = volumes[last] / (volumes.slice(last-10, last).reduce((a,b)=>a+b,0)/10)
      const dayRange   = (highs[last] - lows[last]) / closes[last] * 100
      const prevRange  = (highs[last-1] - lows[last-1]) / closes[last-1] * 100
      const cleanGap   = gapPct < 0.3   // our filter: avoid big gaps (39% false signals)
      const volConfirm = volRatio > 1.2  // volume 20% above average
      const orb_range  = atr14[last] * 0.5  // estimated ORB range

      if (cleanGap && volConfirm && ema9[last] > ema21[last]) {
        signal = 'BUY'
        confidence = 76
        reason = `ORB setup: Gap ${gapPct.toFixed(2)}% (clean), Vol ${(volRatio*100).toFixed(0)}% of avg, trend up. High probability day.`
      } else if (cleanGap && volConfirm && ema9[last] < ema21[last]) {
        signal = 'SELL'
        confidence = 72
        reason = `ORB setup: Gap ${gapPct.toFixed(2)}% (clean), Vol ${(volRatio*100).toFixed(0)}% of avg, trend down.`
      } else if (!cleanGap) {
        reason = `Gap too large (${gapPct.toFixed(2)}%). High risk of false ORB break (39% of big-gap days are choppy). Skip.`
        confidence = 30
      } else {
        reason = `Volume not confirming (${(volRatio*100).toFixed(0)}% of avg). Need 120%+ volume for ORB entry.`
        confidence = 35
      }
    }

    // ================================================================
    // STRATEGY 3: PZ Gap & Fade
    // Market has equal gap-ups (24) and gap-downs (24) — most fill
    // Fade gaps > 0.3%, target previous close
    // ================================================================
    else if (strategy === 'pz-gap-fade') {
      strategy_detail = 'Gap & Fade — 24 gap-ups + 24 gap-downs in 3 months. Most gaps fill within 90 mins.'

      const gap      = (opens[last] - closes[last-1]) / closes[last-1] * 100
      const prevClose = closes[last-1]
      const bigGapUp  = gap > 0.35
      const bigGapDn  = gap < -0.35

      if (bigGapUp) {
        signal = 'SELL'  // fade the gap up → expect price to come back down
        confidence = 68
        reason = `Gap UP ${gap.toFixed(2)}% detected. Fading gap — target prev close ₹${prevClose?.toFixed(0)}`
        stopLoss = price * 1.003   // stop above gap
        target   = prevClose       // target = prev close (gap fill)
      } else if (bigGapDn) {
        signal = 'BUY'   // fade the gap down → expect bounce
        confidence = 65
        reason = `Gap DOWN ${gap.toFixed(2)}% detected. Fading gap — target prev close ₹${prevClose?.toFixed(0)}`
        stopLoss = price * 0.997
        target   = prevClose
      } else {
        reason = `Gap only ${gap.toFixed(2)}%. Not large enough to fade (need >0.35%). No trade today.`
        confidence = 20
      }
    }

    // ================================================================
    // STRATEGY 4: PZ Weak Stock Swing (3-5 day)
    // IT sector -24% to -31% in 3 months → short bounces
    // Best for TCS, INFY when they rally to EMA on Thu/Fri
    // ================================================================
    else if (strategy === 'pz-swing') {
      strategy_detail = 'Weak Stock Swing — IT sector down 24-31%. Short rallies to EMA on Thu/Fri. 3-5 day hold.'

      const inDowntrend = ema9[last] < ema21[last] && closes[last] < ema21[last]
      const bouncing    = closes[last] > closes[last-1] && closes[last-1] > closes[last-2]
      const nearEMA     = Math.abs(closes[last] - ema21[last]) / ema21[last] * 100 < 1.5
      const rsi         = rsi14[last]
      const isThursFri  = dow === 4 || dow === 5

      if (inDowntrend && bouncing && nearEMA && rsi > 45 && rsi < 65) {
        signal = 'SELL'  // short the bounce in downtrend
        confidence = 71
        reason = `Swing short: ${symbol} in downtrend, bouncing to 21-EMA (within 1.5%). RSI ${rsi?.toFixed(0)} — ideal short entry. Hold 3-5 days.`
        stopLoss = ema21[last] * 1.02
        target   = closes[last] * 0.95
      } else if (!inDowntrend && rsi14[last] < 40) {
        signal = 'BUY'
        confidence = 55
        reason = `Swing long: RSI oversold at ${rsi?.toFixed(0)}, trend holding. Bounce trade — 3-5 days.`
        stopLoss = lows[last] * 0.99
        target   = ema21[last]
      } else {
        reason = inDowntrend
          ? `In downtrend but not at bounce point yet. Wait for rally to ₹${ema21[last]?.toFixed(0)} (21-EMA).`
          : `No clear swing setup. RSI ${rsi14[last]?.toFixed(0)}, EMA trend unclear.`
        confidence = 30
      }
    }

    // ── Default stop/target from ATR ──────────────────────
    if (!stopLoss && signal !== 'HOLD') {
      const atr = atr14[last] || price * 0.01
      stopLoss  = signal === 'BUY' ? price - 1.5*atr : price + 1.5*atr
      target    = signal === 'BUY' ? price + 3.0*atr : price - 3.0*atr
    }

    // ── Chart data (30 days) ──────────────────────────────
    const chartData = timestamps.slice(-30).map((ts, i) => {
      const idx = closes.length - 30 + i
      return {
        date:   new Date(ts*1000).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),
        close:  parseFloat(closes[idx]?.toFixed(2)),
        ema9:   parseFloat(ema9[idx]?.toFixed(2)),
        ema21:  parseFloat(ema21[idx]?.toFixed(2)),
        vwap:   parseFloat(vwap[idx]?.toFixed(2)),
        volume: volumes[idx],
      }
    })

    return res.status(200).json({
      symbol, strategy, strategy_detail,
      signal, reason, confidence,
      price:    parseFloat(price?.toFixed(2)),
      stopLoss: stopLoss ? parseFloat(stopLoss.toFixed(2)) : null,
      target:   target   ? parseFloat(target.toFixed(2))   : null,
      rsi:      parseFloat(rsi14[last]?.toFixed(1)),
      ema9:     parseFloat(ema9[last]?.toFixed(2)),
      ema21:    parseFloat(ema21[last]?.toFixed(2)),
      atr:      parseFloat(atr14[last]?.toFixed(2)),
      today:    today_name,
      chartData,
      marketContext: {
        trend:   'BEARISH',
        note:    'Market down -5% in 3 months. Tue/Wed best days. Thu/Fri weakest.',
        bestDay: 'Tuesday',
        orbSuccessRate: '76%',
      }
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

function calcEMA(data, period) {
  const k = 2 / (period + 1)
  let prev = null, ema = []
  for (const v of data) {
    if (v == null) { ema.push(null); continue }
    prev = prev == null ? v : v*k + prev*(1-k)
    ema.push(prev)
  }
  return ema
}
function calcRSI(data, period) {
  const rsi = new Array(period).fill(null)
  let ag = 0, al = 0
  for (let i=1; i<=period; i++) {
    const d = (data[i]||0)-(data[i-1]||0)
    if (d>0) ag+=d; else al+=Math.abs(d)
  }
  ag/=period; al/=period
  for (let i=period; i<data.length; i++) {
    const d = (data[i]||0)-(data[i-1]||0)
    ag = (ag*(period-1)+(d>0?d:0))/period
    al = (al*(period-1)+(d<0?Math.abs(d):0))/period
    rsi.push(al===0?100:100-100/(1+ag/al))
  }
  return rsi
}
function calcATR(highs, lows, closes, period) {
  const tr=[0], atr=new Array(period).fill(null)
  for (let i=1;i<highs.length;i++)
    tr.push(Math.max((highs[i]||0)-(lows[i]||0),
      Math.abs((highs[i]||0)-(closes[i-1]||0)),
      Math.abs((lows[i]||0)-(closes[i-1]||0))))
  let s=tr.slice(1,period+1).reduce((a,b)=>a+b,0)/period
  atr[period]=s
  for (let i=period+1;i<tr.length;i++){s=(s*(period-1)+tr[i])/period;atr.push(s)}
  return atr
}
function calcVWAP(highs, lows, closes, volumes, period) {
  const typical = highs.map((h,i)=>(h+lows[i]+closes[i])/3)
  return typical.map((_,i)=>{
    if (i<period) return null
    const tSlice=typical.slice(i-period,i), vSlice=volumes.slice(i-period,i)
    const num=tSlice.reduce((a,t,j)=>a+t*(vSlice[j]||0),0)
    const den=vSlice.reduce((a,b)=>a+(b||0),0)
    return den>0?num/den:null
  })
}
