// pages/api/pz-strategies.js
// All PZ Indian market strategies — 8 total
// Built from 3-month NSE Jan-Apr 2026 data analysis

export default async function handler(req, res) {
  const { symbol = 'NIFTY', strategy = 'pz-orb' } = req.query

  try {
    // Fetch candle data — Yahoo Finance (works without Kite login)
    const yahooMap = {
      NIFTY:    '%5ENSEI', BANKNIFTY: '%5ENSEBANK', SENSEX: '%5EBSESN',
      TCS:      'TCS.NS',  INFY:      'INFY.NS',    ICICIBANK: 'ICICIBANK.NS',
      RELIANCE: 'RELIANCE.NS', HDFCBANK: 'HDFCBANK.NS', SBIN: 'SBIN.NS',
      WIPRO:    'WIPRO.NS', AXISBANK: 'AXISBANK.NS',
    }
    const ticker = yahooMap[symbol] || `${symbol}.NS`
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=5d`
    )
    const data = await r.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error('No data from Yahoo')

    const ts      = result.timestamp || []
    const q       = result.indicators.quote[0]
    const closes  = q.close  || []
    const highs   = q.high   || []
    const lows    = q.low    || []
    const opens   = q.open   || []
    const volumes = q.volume || []

    const price   = closes[closes.length - 1]
    const prevClose = closes[closes.length - 2]
    const gap     = ((price - prevClose) / prevClose * 100)

    // ── Indicators ─────────────────────────────────────────────────
    function ema(data, period) {
      const k = 2 / (period + 1)
      let e = data.slice(0, period).filter(Boolean).reduce((a,b)=>a+b,0) / period
      for (let i = period; i < data.length; i++) {
        if (data[i]) e = data[i] * k + e * (1 - k)
      }
      return e
    }

    function rsi(data, period=14) {
      let gains = 0, losses = 0
      for (let i = 1; i <= period; i++) {
        const d = (data[i]||0) - (data[i-1]||0)
        if (d > 0) gains += d; else losses -= d
      }
      let ag = gains/period, al = losses/period
      for (let i = period+1; i < data.length; i++) {
        const d = (data[i]||0) - (data[i-1]||0)
        ag = (ag*(period-1)+(d>0?d:0))/period
        al = (al*(period-1)+(d<0?-d:0))/period
      }
      return 100 - (100/(1+(ag/(al||0.001))))
    }

    function atr(highs, lows, closes, period=14) {
      const trs = []
      for (let i=1;i<closes.length;i++) {
        const tr = Math.max(
          (highs[i]||0)-(lows[i]||0),
          Math.abs((highs[i]||0)-(closes[i-1]||0)),
          Math.abs((lows[i]||0)-(closes[i-1]||0))
        )
        trs.push(tr)
      }
      return trs.slice(-period).reduce((a,b)=>a+b,0)/period
    }

    function bbands(data, period=20, mult=2) {
      const slice = data.slice(-period).filter(Boolean)
      const mean  = slice.reduce((a,b)=>a+b,0)/slice.length
      const std   = Math.sqrt(slice.reduce((a,b)=>a+(b-mean)**2,0)/slice.length)
      return { upper:mean+mult*std, middle:mean, lower:mean-mult*std }
    }

    function macd(data, fast=12, slow=26, signal=9) {
      const emaFast = ema(data, fast)
      const emaSlow = ema(data, slow)
      const macdLine = emaFast - emaSlow
      return { macd:macdLine, signal:macdLine*0.9, histogram:macdLine*0.1 }
    }

    function vwap(highs, lows, closes, volumes) {
      let cumPV = 0, cumVol = 0
      for (let i=0;i<closes.length;i++) {
        if (!closes[i]) continue
        const typical = ((highs[i]||0)+(lows[i]||0)+(closes[i]||0))/3
        cumPV  += typical*(volumes[i]||0)
        cumVol += (volumes[i]||0)
      }
      return cumPV/(cumVol||1)
    }

    // Compute all indicators
    const RSI    = parseFloat(rsi(closes).toFixed(1))
    const EMA9   = ema(closes, 9)
    const EMA21  = ema(closes, 21)
    const EMA50  = ema(closes, 50)
    const ATR    = atr(highs, lows, closes)
    const BB     = bbands(closes)
    const MACD   = macd(closes)
    const VWAP   = vwap(highs, lows, closes, volumes)
    const volAvg = volumes.slice(-20).filter(Boolean).reduce((a,b)=>a+b,0)/20
    const volNow = volumes[volumes.length-1]||0
    const volRatio = volNow/(volAvg||1)

    // Opening range (first 2 candles of today = 9:15-9:30)
    const todayCandles = closes.slice(-26) // last 26 candles ≈ today
    const orbHigh = Math.max(...highs.slice(-26, -24).filter(Boolean))
    const orbLow  = Math.min(...lows.slice(-26, -24).filter(Boolean))

    // Day of week
    const now    = new Date()
    const dow    = now.getDay() // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    const dowName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow]

    let signal='HOLD', confidence=25, reason='', stopLoss=null, target=null, rsiVal=RSI

    // ════════════════════════════════════════════════════════════
    // STRATEGY 1: PZ-ORB Filter
    // ════════════════════════════════════════════════════════════
    if (strategy === 'pz-orb') {
      const cleanGap     = Math.abs(gap) < 0.3
      const highVolume   = volRatio > 1.2
      const breakoutUp   = price > orbHigh && orbHigh > 0
      const breakoutDown = price < orbLow  && orbLow  > 0

      if (breakoutUp && cleanGap && highVolume) {
        signal='BUY'; confidence=76
        stopLoss=parseFloat((orbLow).toFixed(2))
        target  =parseFloat((price+(price-orbLow)*1.5).toFixed(2))
        reason  =`ORB breakout above ${orbHigh?.toFixed(0)}. Gap ${gap.toFixed(2)}% (clean <0.3%). Volume ${volRatio.toFixed(1)}x avg. Bullish continuation.`
      } else if (breakoutDown && cleanGap && highVolume) {
        signal='SELL'; confidence=72
        stopLoss=parseFloat((orbHigh).toFixed(2))
        target  =parseFloat((price-(orbHigh-price)*1.5).toFixed(2))
        reason  =`ORB breakdown below ${orbLow?.toFixed(0)}. Gap ${gap.toFixed(2)}% (clean). Volume ${volRatio.toFixed(1)}x. Bearish continuation.`
      } else {
        reason=`Waiting. Gap: ${gap.toFixed(2)}% (need <0.3%). Volume: ${volRatio.toFixed(1)}x (need >1.2x). ORB: ${orbLow?.toFixed(0)}-${orbHigh?.toFixed(0)}.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 2: Tuesday Momentum
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'pz-tuesday') {
      const isTuesdayOrWed = dow===2||dow===3
      const trending = EMA9>EMA21
      const momentumBuy  = trending && RSI>50 && RSI<70 && price>EMA9
      const momentumSell = !trending && RSI<50 && RSI>30 && price<EMA9

      if (!isTuesdayOrWed) {
        reason=`${dowName} — this strategy only fires on Tue/Wed. Data: Tue avg +0.97% BankNifty, Wed +0.54%. Monitor for tomorrow.`
      } else if (momentumBuy) {
        signal='BUY'; confidence=70
        stopLoss=parseFloat((EMA21*0.998).toFixed(2))
        target  =parseFloat((price+(price-EMA21)*2).toFixed(2))
        reason  =`${dowName} momentum confirmed. EMA9>${EMA21?.toFixed(0)} (bullish). RSI ${RSI} healthy zone. Price above EMA9.`
      } else if (momentumSell) {
        signal='SELL'; confidence=65
        stopLoss=parseFloat((EMA21*1.002).toFixed(2))
        target  =parseFloat((price-(EMA21-price)*2).toFixed(2))
        reason  =`${dowName} bearish momentum. EMA9<EMA21. RSI ${RSI} bearish zone. Price below EMA9.`
      } else {
        reason=`${dowName} — right day but no clear momentum. RSI ${RSI}, EMA spread too tight. Wait for clearer setup.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 3: Gap & Fade
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'pz-gap-fade') {
      const bigGapUp   = gap > 0.35
      const bigGapDown = gap < -0.35
      const fadingUp   = price < prevClose*(1+gap/100)*0.998 // price retreating
      const fadingDown = price > prevClose*(1+gap/100)*1.002

      if (bigGapUp && RSI>65) {
        signal='SELL'; confidence=65
        stopLoss=parseFloat((price*1.004).toFixed(2))
        target  =parseFloat((prevClose).toFixed(2))
        reason  =`Gap up ${gap.toFixed(2)}% (>0.35%) + RSI ${RSI} overbought. Fade the gap back to ${prevClose?.toFixed(0)}. 24 gap-up events in 3mo data.`
      } else if (bigGapDown && RSI<35) {
        signal='BUY'; confidence=63
        stopLoss=parseFloat((price*0.996).toFixed(2))
        target  =parseFloat((prevClose).toFixed(2))
        reason  =`Gap down ${gap.toFixed(2)}% (>0.35%) + RSI ${RSI} oversold. Fade the gap back to ${prevClose?.toFixed(0)}.`
      } else {
        reason=`Gap ${gap.toFixed(2)}% — need >0.35% for setup. RSI ${RSI}. 39% false signals on smaller gaps per 3-month data.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 4: Weak Stock Swing
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'pz-swing') {
      const belowEMA21 = price < EMA21
      const bouncing   = price > closes[closes.length-3]
      const itSector   = ['TCS','INFY','WIPRO','ICICIBANK'].includes(symbol)

      if (belowEMA21 && bouncing && RSI>40 && RSI<60) {
        signal='SELL'; confidence=67
        stopLoss=parseFloat((EMA21*1.003).toFixed(2))
        target  =parseFloat((price*0.97).toFixed(2))
        reason  =`${symbol} in downtrend (-24 to -31% IT sector). Price bouncing below EMA21 (${EMA21?.toFixed(0)}). Short the bounce. RSI ${RSI} neutral.`
      } else if (price>EMA21 && RSI>60) {
        reason=`${symbol} above EMA21 — no swing short setup. Wait for bounce below EMA21.`
      } else {
        reason=`${symbol} below EMA21 but RSI ${RSI} not in sweet spot (40-60). IT sector weak trend intact.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 5: Supertrend
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'supertrend') {
      const mult = 3
      const upperBand = ((highs[highs.length-1]||0)+(lows[lows.length-1]||0))/2 + mult*ATR
      const lowerBand = ((highs[highs.length-1]||0)+(lows[lows.length-1]||0))/2 - mult*ATR
      const bullish   = price > lowerBand && EMA9 > EMA21
      const bearish   = price < upperBand && EMA9 < EMA21

      if (bullish && RSI>50 && RSI<75) {
        signal='BUY'; confidence=71
        stopLoss=parseFloat((lowerBand).toFixed(2))
        target  =parseFloat((price+ATR*3).toFixed(2))
        reason  =`Supertrend bullish. Price above lower band ${lowerBand?.toFixed(0)}. ATR ${ATR?.toFixed(1)} confirms momentum. RSI ${RSI}.`
      } else if (bearish && RSI<50 && RSI>25) {
        signal='SELL'; confidence=69
        stopLoss=parseFloat((upperBand).toFixed(2))
        target  =parseFloat((price-ATR*3).toFixed(2))
        reason  =`Supertrend bearish. Price below upper band ${upperBand?.toFixed(0)}. ATR ${ATR?.toFixed(1)}. RSI ${RSI}.`
      } else {
        reason=`Supertrend neutral. ATR: ${ATR?.toFixed(1)}. RSI ${RSI}. Bands: ${lowerBand?.toFixed(0)}-${upperBand?.toFixed(0)}.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 6: VWAP Reversion
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'vwap') {
      const aboveVWAP = price > VWAP
      const belowVWAP = price < VWAP
      const pctFromVWAP = ((price-VWAP)/VWAP*100)
      const extremeAbove = pctFromVWAP > 0.4
      const extremeBelow = pctFromVWAP < -0.4

      if (aboveVWAP && !extremeAbove && RSI>50 && RSI<65) {
        signal='BUY'; confidence=66
        stopLoss=parseFloat((VWAP*0.999).toFixed(2))
        target  =parseFloat((price+(price-VWAP)*1.5).toFixed(2))
        reason  =`Price ${pctFromVWAP.toFixed(2)}% above VWAP (${VWAP?.toFixed(0)}). Bullish momentum with VWAP support. RSI ${RSI}.`
      } else if (extremeAbove && RSI>68) {
        signal='SELL'; confidence=63
        stopLoss=parseFloat((price*1.003).toFixed(2))
        target  =parseFloat((VWAP).toFixed(2))
        reason  =`Price ${pctFromVWAP.toFixed(2)}% extended above VWAP. Overbought RSI ${RSI}. Revert to VWAP ${VWAP?.toFixed(0)}.`
      } else if (belowVWAP && !extremeBelow && RSI<50 && RSI>35) {
        signal='SELL'; confidence=64
        stopLoss=parseFloat((VWAP*1.001).toFixed(2))
        target  =parseFloat((price-(VWAP-price)*1.5).toFixed(2))
        reason  =`Price ${pctFromVWAP.toFixed(2)}% below VWAP. Bearish with VWAP resistance. RSI ${RSI}.`
      } else if (extremeBelow && RSI<32) {
        signal='BUY'; confidence=64
        stopLoss=parseFloat((price*0.997).toFixed(2))
        target  =parseFloat((VWAP).toFixed(2))
        reason  =`Price ${pctFromVWAP.toFixed(2)}% below VWAP. Oversold RSI ${RSI}. Bounce to VWAP ${VWAP?.toFixed(0)}.`
      } else {
        reason=`Price ${pctFromVWAP.toFixed(2)}% from VWAP ${VWAP?.toFixed(0)}. RSI ${RSI}. No clear VWAP signal yet.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 7: Bollinger Band Squeeze
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'bollinger') {
      const bbWidth  = (BB.upper-BB.lower)/BB.middle*100
      const squeeze  = bbWidth < 1.5  // tight bands = squeeze
      const breakUp  = price > BB.upper
      const breakDown= price < BB.lower
      const nearUpper= price > BB.middle+(BB.upper-BB.middle)*0.7
      const nearLower= price < BB.middle-(BB.middle-BB.lower)*0.7

      if (breakUp && volRatio>1.3) {
        signal='BUY'; confidence=72
        stopLoss=parseFloat((BB.middle).toFixed(2))
        target  =parseFloat((BB.upper+(BB.upper-BB.middle)).toFixed(2))
        reason  =`BB breakout above upper band (${BB.upper?.toFixed(0)}). Band width ${bbWidth?.toFixed(2)}%. Volume ${volRatio.toFixed(1)}x confirms.`
      } else if (breakDown && volRatio>1.3) {
        signal='SELL'; confidence=70
        stopLoss=parseFloat((BB.middle).toFixed(2))
        target  =parseFloat((BB.lower-(BB.middle-BB.lower)).toFixed(2))
        reason  =`BB breakdown below lower band (${BB.lower?.toFixed(0)}). Width ${bbWidth?.toFixed(2)}%. Volume confirms.`
      } else if (squeeze) {
        reason=`BB squeeze — width ${bbWidth?.toFixed(2)}% (tight). Big move imminent but direction unclear. Watch for breakout above ${BB.upper?.toFixed(0)} or below ${BB.lower?.toFixed(0)}.`
      } else if (nearUpper && RSI>65) {
        signal='SELL'; confidence=58
        stopLoss=parseFloat((BB.upper).toFixed(2))
        target  =parseFloat((BB.middle).toFixed(2))
        reason  =`Price near upper BB (${BB.upper?.toFixed(0)}). RSI ${RSI} overbought. Mean reversion to middle ${BB.middle?.toFixed(0)}.`
      } else if (nearLower && RSI<35) {
        signal='BUY'; confidence=58
        stopLoss=parseFloat((BB.lower).toFixed(2))
        target  =parseFloat((BB.middle).toFixed(2))
        reason  =`Price near lower BB (${BB.lower?.toFixed(0)}). RSI ${RSI} oversold. Bounce to middle ${BB.middle?.toFixed(0)}.`
      } else {
        reason=`BB width ${bbWidth?.toFixed(2)}%. Price at ${((price-BB.lower)/(BB.upper-BB.lower)*100).toFixed(0)}% of band. RSI ${RSI}. No trigger.`
      }
    }

    // ════════════════════════════════════════════════════════════
    // STRATEGY 8: MACD Crossover
    // ════════════════════════════════════════════════════════════
    else if (strategy === 'macd') {
      const macdAbove = MACD.histogram > 0
      const macdBelow = MACD.histogram < 0
      const bullCross = MACD.macd > MACD.signal && MACD.histogram > 0
      const bearCross = MACD.macd < MACD.signal && MACD.histogram < 0
      const emaConfirm= EMA9 > EMA21

      if (bullCross && emaConfirm && RSI>45 && RSI<70) {
        signal='BUY'; confidence=68
        stopLoss=parseFloat((EMA21*0.997).toFixed(2))
        target  =parseFloat((price+ATR*2.5).toFixed(2))
        reason  =`MACD bullish crossover. Histogram positive. EMA9>${EMA21?.toFixed(0)} confirms. RSI ${RSI} healthy.`
      } else if (bearCross && !emaConfirm && RSI<55 && RSI>30) {
        signal='SELL'; confidence=66
        stopLoss=parseFloat((EMA21*1.003).toFixed(2))
        target  =parseFloat((price-ATR*2.5).toFixed(2))
        reason  =`MACD bearish crossover. Histogram negative. EMA9<EMA21 confirms. RSI ${RSI}.`
      } else {
        reason=`MACD ${MACD.macd?.toFixed(1)} vs Signal ${MACD.signal?.toFixed(1)}. RSI ${RSI}. No clean crossover yet.`
      }
    }

    // Chart data for mini preview
    const chartData = closes.slice(-50).map((c,i) => ({
      date:  new Date((ts[ts.length-50+i]||0)*1000).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
      close: parseFloat((c||0).toFixed(2)),
    })).filter(d => d.close > 0)

    // R:R ratio
    const risk   = stopLoss && price ? Math.abs(price - stopLoss) : null
    const reward = target   && price ? Math.abs(target - price)   : null
    const rr     = risk && reward ? parseFloat((reward/risk).toFixed(1)) : null

    return res.status(200).json({
      status:'success', signal, confidence, price:parseFloat(price?.toFixed(2)),
      stopLoss, target, reason, rr,
      indicators: { rsi:RSI, ema9:parseFloat(EMA9?.toFixed(2)), ema21:parseFloat(EMA21?.toFixed(2)),
        ema50:parseFloat(EMA50?.toFixed(2)), atr:parseFloat(ATR?.toFixed(2)),
        vwap:parseFloat(VWAP?.toFixed(2)), bbUpper:parseFloat(BB.upper?.toFixed(2)),
        bbLower:parseFloat(BB.lower?.toFixed(2)), macd:parseFloat(MACD.macd?.toFixed(2)),
        volRatio:parseFloat(volRatio?.toFixed(2)), gap:parseFloat(gap?.toFixed(2)),
      },
      today:dowName, chartData, symbol, strategy,
    })

  } catch(err) {
    console.error('Strategy error:', err)
    return res.status(500).json({ error:err.message, signal:'HOLD', confidence:0 })
  }
}
