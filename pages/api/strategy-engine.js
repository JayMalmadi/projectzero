// /api/strategy-engine
// Reads historical OHLCV from Supabase, computes indicators, returns signal
// Clean slate — no old Yahoo-candle strategies
// All strategies here are based on stored historical data + live price

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// ── Indicator Library ─────────────────────────────────────────
function ema(closes, period) {
  const k = 2 / (period + 1)
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k)
  }
  return val
}

function emaArr(closes, period) {
  const k = 2 / (period + 1)
  const out = new Array(closes.length).fill(null)
  let sum = 0, count = 0
  for (let i = 0; i < period && i < closes.length; i++) { sum += closes[i]; count++ }
  if (count < period) return out
  out[period - 1] = sum / period
  for (let i = period; i < closes.length; i++) {
    out[i] = closes[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gains += d; else losses += Math.abs(d)
  }
  let ag = gains / period, al = losses / period
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period
    al = (al * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period
  }
  return al === 0 ? 100 : parseFloat((100 - 100 / (1 + ag / al)).toFixed(2))
}

function atr(highs, lows, closes, period = 14) {
  const trs = []
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ))
  }
  if (trs.length < period) return trs[trs.length - 1] || 0
  let atrVal = trs.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period
  }
  return parseFloat(atrVal.toFixed(4))
}

function macd(closes) {
  const e12 = emaArr(closes, 12)
  const e26 = emaArr(closes, 26)
  const macdLine = e12.map((v, i) => (v && e26[i]) ? v - e26[i] : null)
  const validMacd = macdLine.filter(v => v !== null)
  const signal9 = emaArr(validMacd, 9)
  const n = validMacd.length - 1
  return {
    macd:      validMacd[n] || 0,
    signal:    signal9[n] || 0,
    histogram: (validMacd[n] || 0) - (signal9[n] || 0),
    crossUp:   validMacd[n] > signal9[n] && validMacd[n - 1] <= signal9[n - 1],
    crossDown: validMacd[n] < signal9[n] && validMacd[n - 1] >= signal9[n - 1],
  }
}

function bollingerBands(closes, period = 20, stdMult = 2) {
  const slice = closes.slice(-period)
  const mean  = slice.reduce((a, b) => a + b, 0) / period
  const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period)
  return {
    upper:  parseFloat((mean + stdMult * std).toFixed(4)),
    middle: parseFloat(mean.toFixed(4)),
    lower:  parseFloat((mean - stdMult * std).toFixed(4)),
    width:  parseFloat(((mean + stdMult * std - (mean - stdMult * std)) / mean * 100).toFixed(2)),
  }
}

// Volume spike detection — volume vs N-period average
function volumeSpike(volumes, period = 20) {
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period
  const current = volumes[volumes.length - 1]
  return avg > 0 ? parseFloat((current / avg).toFixed(2)) : 1
}

// ── Fetch candles from Supabase ───────────────────────────────
async function getCandles(symbol, timeframe, limit = 200) {
  // Use ohlcv_15min for intraday strategies, ohlcv_daily for daily
  const tableName = (timeframe === 'daily' || timeframe === '1d') ? 'ohlcv_daily' : 'ohlcv_15min'
  const tsCol     = tableName === 'ohlcv_daily' ? 'date' : 'ts'

  const { data, error } = await sb
    .from(tableName)
    .select(`${tsCol}, open, high, low, close, volume`)
    .eq('symbol', symbol)
    .order(tsCol, { ascending: false })
    .limit(limit)

  if (error || !data?.length) return null

  // Reverse to chronological order
  return data.reverse().map(c => ({
    ts:     c.ts || c.date,
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume || 0),
  }))
}

// ── Strategy: EMA Trend + RSI + Volume ───────────────────────
// Works for both India and Crypto on 15min or 1h candles
// Entry: EMA9 > EMA21 > EMA50 (trend) + RSI in range + volume spike
// This is a momentum strategy with volume confirmation
function stratEmaTrendVolume(candles, livePrice) {
  if (candles.length < 55) return { signal: 'HOLD', reason: 'Not enough data', confidence: 0 }

  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)

  const price   = livePrice || closes[closes.length - 1]
  const ema9    = ema(closes, 9)
  const ema21   = ema(closes, 21)
  const ema50   = ema(closes, 50)
  const rsiVal  = rsi(closes, 14)
  const atrVal  = atr(highs, lows, closes, 14)
  const volRatio = volumeSpike(volumes, 20)

  // Trend conditions
  const bullTrend = ema9 > ema21 && ema21 > ema50
  const bearTrend = ema9 < ema21 && ema21 < ema50
  const volConfirm = volRatio >= 1.3  // 30% above average

  let signal = 'HOLD', confidence = 0, reason = '', stopLoss = null, target = null

  if (bullTrend && rsiVal > 50 && rsiVal < 70 && volConfirm && price > ema9) {
    signal     = 'BUY'
    confidence = Math.round(60 + Math.min(rsiVal - 50, 10) + Math.min(volRatio * 5, 15))
    stopLoss   = parseFloat((price - atrVal * 2).toFixed(2))
    target     = parseFloat((price + atrVal * 3).toFixed(2))
    reason     = `EMA9(${ema9.toFixed(0)}) > EMA21(${ema21.toFixed(0)}) > EMA50(${ema50.toFixed(0)}) bullish stack. RSI ${rsiVal} healthy. Volume ${volRatio}x avg.`
  } else if (bearTrend && rsiVal < 50 && rsiVal > 30 && volConfirm && price < ema9) {
    signal     = 'SELL'
    confidence = Math.round(60 + Math.min(50 - rsiVal, 10) + Math.min(volRatio * 5, 15))
    stopLoss   = parseFloat((price + atrVal * 2).toFixed(2))
    target     = parseFloat((price - atrVal * 3).toFixed(2))
    reason     = `EMA9(${ema9.toFixed(0)}) < EMA21(${ema21.toFixed(0)}) < EMA50(${ema50.toFixed(0)}) bearish stack. RSI ${rsiVal}. Volume ${volRatio}x avg.`
  } else {
    reason = `No trend alignment. EMA9:${ema9.toFixed(0)} EMA21:${ema21.toFixed(0)} EMA50:${ema50.toFixed(0)} | RSI:${rsiVal} | Vol:${volRatio}x`
  }

  const rr = stopLoss && target ? parseFloat((Math.abs(target - price) / Math.abs(price - stopLoss)).toFixed(1)) : null

  return {
    signal, confidence: Math.min(confidence, 92), reason, stopLoss, target, rr,
    indicators: { ema9: parseFloat(ema9.toFixed(2)), ema21: parseFloat(ema21.toFixed(2)),
      ema50: parseFloat(ema50.toFixed(2)), rsi: rsiVal, atr: parseFloat(atrVal.toFixed(2)), volRatio },
  }
}

// ── Strategy: MACD Crossover + Bollinger ─────────────────────
// Entry: MACD crossover + price near Bollinger band edge + RSI confirmation
function stratMacdBollinger(candles, livePrice) {
  if (candles.length < 35) return { signal: 'HOLD', reason: 'Not enough data', confidence: 0 }

  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)

  const price    = livePrice || closes[closes.length - 1]
  const macdVal  = macd(closes)
  const bb       = bollingerBands(closes)
  const rsiVal   = rsi(closes, 14)
  const atrVal   = atr(highs, lows, closes, 14)
  const volRatio = volumeSpike(volumes, 20)

  let signal = 'HOLD', confidence = 0, reason = '', stopLoss = null, target = null

  if (macdVal.crossUp && rsiVal > 40 && rsiVal < 65 && price > bb.lower) {
    signal     = 'BUY'
    confidence = Math.round(65 + (volRatio >= 1.2 ? 10 : 0) + (rsiVal > 50 ? 5 : 0))
    stopLoss   = parseFloat((bb.lower - atrVal * 0.5).toFixed(2))
    target     = parseFloat((bb.upper).toFixed(2))
    reason     = `MACD bullish crossover (${macdVal.macd.toFixed(1)} > signal). RSI ${rsiVal}. BB upper target ${bb.upper.toFixed(0)}.`
  } else if (macdVal.crossDown && rsiVal < 60 && rsiVal > 35 && price < bb.upper) {
    signal     = 'SELL'
    confidence = Math.round(65 + (volRatio >= 1.2 ? 10 : 0) + (rsiVal < 50 ? 5 : 0))
    stopLoss   = parseFloat((bb.upper + atrVal * 0.5).toFixed(2))
    target     = parseFloat((bb.lower).toFixed(2))
    reason     = `MACD bearish crossover (${macdVal.macd.toFixed(1)} < signal). RSI ${rsiVal}. BB lower target ${bb.lower.toFixed(0)}.`
  } else if (price <= bb.lower * 1.002 && rsiVal < 32) {
    signal     = 'BUY'
    confidence = Math.round(60 + Math.min((32 - rsiVal) * 1.5, 20))
    stopLoss   = parseFloat((bb.lower - atrVal).toFixed(2))
    target     = parseFloat((bb.middle).toFixed(2))
    reason     = `RSI ${rsiVal} oversold at lower Bollinger Band (${bb.lower.toFixed(0)}). Mean reversion to ${bb.middle.toFixed(0)}.`
  } else if (price >= bb.upper * 0.998 && rsiVal > 68) {
    signal     = 'SELL'
    confidence = Math.round(60 + Math.min((rsiVal - 68) * 1.5, 20))
    stopLoss   = parseFloat((bb.upper + atrVal).toFixed(2))
    target     = parseFloat((bb.middle).toFixed(2))
    reason     = `RSI ${rsiVal} overbought at upper Bollinger Band (${bb.upper.toFixed(0)}). Mean reversion to ${bb.middle.toFixed(0)}.`
  } else {
    reason = `No signal. MACD hist:${macdVal.histogram.toFixed(1)} | RSI:${rsiVal} | BB:${bb.lower.toFixed(0)}-${bb.upper.toFixed(0)} | Price:${price.toFixed(0)}`
  }

  const rr = stopLoss && target ? parseFloat((Math.abs(target - price) / Math.abs(price - stopLoss)).toFixed(1)) : null

  return {
    signal, confidence: Math.min(confidence, 88), reason, stopLoss, target, rr,
    indicators: { macd: parseFloat(macdVal.macd.toFixed(2)), macdSignal: parseFloat(macdVal.signal.toFixed(2)),
      histogram: parseFloat(macdVal.histogram.toFixed(2)), crossUp: macdVal.crossUp, crossDown: macdVal.crossDown,
      bbUpper: bb.upper, bbLower: bb.lower, bbMiddle: bb.middle, bbWidth: bb.width, rsi: rsiVal, volRatio },
  }
}

// ── Strategy: Volume Surge Detection ─────────────────────────
// Pure volume-based — detects unusual volume spikes with price confirmation
// Best for detecting institutional activity
function stratVolumeSurge(candles, livePrice) {
  if (candles.length < 25) return { signal: 'HOLD', reason: 'Not enough data', confidence: 0 }

  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)

  const price    = livePrice || closes[closes.length - 1]
  const volRatio = volumeSpike(volumes, 20)
  const rsiVal   = rsi(closes, 14)
  const ema21val = ema(closes, 21)
  const atrVal   = atr(highs, lows, closes, 14)

  // Price direction in this candle
  const lastCandle = candles[candles.length - 1]
  const bullishCandle = lastCandle.close > lastCandle.open
  const bearishCandle = lastCandle.close < lastCandle.open
  const candleBody = Math.abs(lastCandle.close - lastCandle.open)
  const candleRange = lastCandle.high - lastCandle.low
  const bodyRatio = candleRange > 0 ? candleBody / candleRange : 0

  let signal = 'HOLD', confidence = 0, reason = '', stopLoss = null, target = null

  if (volRatio >= 2.0 && bullishCandle && bodyRatio > 0.5 && rsiVal < 72) {
    signal     = 'BUY'
    confidence = Math.round(65 + Math.min(volRatio * 5, 20))
    stopLoss   = parseFloat((lastCandle.low - atrVal * 0.5).toFixed(2))
    target     = parseFloat((price + atrVal * 2.5).toFixed(2))
    reason     = `Volume surge ${volRatio}x average with bullish candle (body ${(bodyRatio*100).toFixed(0)}%). Institutional buying signal.`
  } else if (volRatio >= 2.0 && bearishCandle && bodyRatio > 0.5 && rsiVal > 28) {
    signal     = 'SELL'
    confidence = Math.round(65 + Math.min(volRatio * 5, 20))
    stopLoss   = parseFloat((lastCandle.high + atrVal * 0.5).toFixed(2))
    target     = parseFloat((price - atrVal * 2.5).toFixed(2))
    reason     = `Volume surge ${volRatio}x average with bearish candle (body ${(bodyRatio*100).toFixed(0)}%). Institutional selling signal.`
  } else {
    reason = `Volume ${volRatio}x avg (need ≥2x). Candle body ratio: ${(bodyRatio*100).toFixed(0)}%. RSI: ${rsiVal}.`
  }

  const rr = stopLoss && target ? parseFloat((Math.abs(target - price) / Math.abs(price - stopLoss)).toFixed(1)) : null

  return {
    signal, confidence: Math.min(confidence, 85), reason, stopLoss, target, rr,
    indicators: { volRatio, rsi: rsiVal, ema21: parseFloat(ema21val.toFixed(2)),
      bodyRatio: parseFloat(bodyRatio.toFixed(2)), bullishCandle, bearishCandle },
  }
}

// ── Strategy registry ─────────────────────────────────────────
const STRATEGIES = {
  'ema-trend':     { fn: stratEmaTrendVolume,  name: 'EMA Trend + Volume',    timeframe: '15min', minCandles: 55 },
  'macd-bollinger':{ fn: stratMacdBollinger,   name: 'MACD + Bollinger',      timeframe: '15min', minCandles: 35 },
  'volume-surge':  { fn: stratVolumeSurge,     name: 'Volume Surge Detection', timeframe: '15min', minCandles: 25 },
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  const { symbol, strategy, timeframe, livePrice } = req.query

  if (!symbol || !strategy) {
    return res.status(400).json({
      error: 'symbol and strategy required',
      available: Object.keys(STRATEGIES),
    })
  }

  const strat = STRATEGIES[strategy]
  if (!strat) {
    return res.status(400).json({
      error: `Unknown strategy. Available: ${Object.keys(STRATEGIES).join(', ')}`,
    })
  }

  try {
    // Use strategy's preferred timeframe or override
    const useTf = timeframe || strat.timeframe

    // Fetch candles from DB
    const candles = await getCandles(symbol, useTf, 300)

    if (!candles || candles.length < strat.minCandles) {
      return res.status(200).json({
        signal: 'HOLD',
        confidence: 0,
        reason: `Insufficient data — need ${strat.minCandles} candles, have ${candles?.length || 0}. Run backfill first.`,
        symbol, strategy, timeframe: useTf,
        needsBackfill: true,
      })
    }

    // Run strategy
    const price  = livePrice ? parseFloat(livePrice) : null
    const result = strat.fn(candles, price)

    return res.status(200).json({
      status:    'success',
      symbol,
      strategy,
      strategyName: strat.name,
      timeframe: useTf,
      price:     price || candles[candles.length - 1]?.close,
      candlesUsed: candles.length,
      lastCandle:  candles[candles.length - 1]?.ts,
      ...result,
    })

  } catch(err) {
    console.error('[StrategyEngine] Error:', err)
    return res.status(500).json({ error: err.message, symbol, strategy })
  }
}
