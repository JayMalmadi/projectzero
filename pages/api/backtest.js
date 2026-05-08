// /api/backtest
// New backtest engine - runs strategy logic against stored OHLCV data
// Uses Supabase ohlcv_15min and ohlcv_daily tables
// Base capital: ₹10,000 (India) / $1,000 (Crypto) — fixed for fair comparison

import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const BASE_CAPITAL = { india: 10000, crypto: 1000 }
const RISK_PCT     = 1.0  // 1% of base per trade

// ── Technical Indicators ───────────────────────────────────────
function ema(data, period) {
  const k = 2 / (period + 1)
  let val = data.slice(0, period).reduce((a,b) => a+b, 0) / period
  const result = [val]
  for (let i = period; i < data.length; i++) {
    val = data[i] * k + val * (1 - k)
    result.push(val)
  }
  return result
}

function rsi(closes, period = 14) {
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1]
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }
  const result = []
  for (let i = period - 1; i < gains.length; i++) {
    const avgG = gains.slice(i-period+1, i+1).reduce((a,b)=>a+b,0) / period
    const avgL = losses.slice(i-period+1, i+1).reduce((a,b)=>a+b,0) / period
    result.push(avgL === 0 ? 100 : 100 - (100 / (1 + avgG/avgL)))
  }
  return result
}

function atr(highs, lows, closes, period = 14) {
  const tr = []
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i-1]),
      Math.abs(lows[i]  - closes[i-1])
    ))
  }
  const result = [tr.slice(0,period).reduce((a,b)=>a+b,0)/period]
  for (let i = period; i < tr.length; i++) {
    result.push((result[result.length-1] * (period-1) + tr[i]) / period)
  }
  return result
}

function bollingerBands(closes, period = 20, multiplier = 2) {
  const result = []
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean  = slice.reduce((a,b) => a+b, 0) / period
    const std   = Math.sqrt(slice.reduce((a,b) => a + (b-mean)**2, 0) / period)
    result.push({ upper: mean + multiplier*std, middle: mean, lower: mean - multiplier*std })
  }
  return result
}

function macdLine(closes) {
  const e12 = ema(closes, 12)
  const e26 = ema(closes, 26)
  const offset = e12.length - e26.length
  const macd = e26.map((v, i) => e12[i + offset] - v)
  const signal = ema(macd, 9)
  const sigOffset = macd.length - signal.length
  return { macd, signal, hist: signal.map((s, i) => macd[i + sigOffset] - s) }
}

// ── Strategy Definitions ───────────────────────────────────────
// Each strategy receives candle arrays and returns trades array
// Trade: { entryIdx, entry, stopLoss, target, direction }

function strategyEMACrossover(candles) {
  const closes = candles.map(c => c.close)
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const fast = ema(closes, 9)
  const slow = ema(closes, 21)
  const atrVals = atr(highs, lows, closes, 14)
  const trades = []
  const offset = closes.length - fast.length
  const atrOffset = closes.length - atrVals.length - 1

  for (let i = 1; i < fast.length - 1; i++) {
    const ci = i + offset
    if (ci < 2 || ci >= candles.length) continue
    const atrV = atrVals[i + atrOffset] || atrVals[atrVals.length-1]

    // BUY: fast crosses above slow
    if (fast[i] > slow[i] && fast[i-1] <= slow[i-1]) {
      trades.push({ entryIdx: ci, entry: candles[ci].close, direction: 'BUY',
        stopLoss: candles[ci].close - atrV * 1.5,
        target:   candles[ci].close + atrV * 3.0, reason: 'EMA9 crossed above EMA21' })
    }
    // SELL: fast crosses below slow
    if (fast[i] < slow[i] && fast[i-1] >= slow[i-1]) {
      trades.push({ entryIdx: ci, entry: candles[ci].close, direction: 'SELL',
        stopLoss: candles[ci].close + atrV * 1.5,
        target:   candles[ci].close - atrV * 3.0, reason: 'EMA9 crossed below EMA21' })
    }
  }
  return trades
}

function strategyRSIReversal(candles) {
  const closes = candles.map(c => c.close)
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const rsiVals = rsi(closes, 14)
  const bbVals  = bollingerBands(closes, 20)
  const atrVals = atr(highs, lows, closes, 14)
  const trades  = []

  const rsiOffset = closes.length - rsiVals.length
  const bbOffset  = closes.length - bbVals.length
  const atrOffset = closes.length - atrVals.length - 1

  for (let i = 1; i < rsiVals.length - 1; i++) {
    const ci   = i + rsiOffset
    const bb   = bbVals[ci - bbOffset]
    const atrV = atrVals[Math.max(0, ci + atrOffset)]
    if (!bb || !atrV) continue

    const price = candles[ci].close

    // BUY: RSI oversold + price at lower BB
    if (rsiVals[i] < 35 && rsiVals[i-1] >= 35 && price <= bb.lower * 1.002) {
      trades.push({ entryIdx: ci, entry: price, direction: 'BUY',
        stopLoss: bb.lower - atrV, target: bb.middle, reason: `RSI ${rsiVals[i].toFixed(0)} oversold + lower BB` })
    }
    // SELL: RSI overbought + price at upper BB
    if (rsiVals[i] > 65 && rsiVals[i-1] <= 65 && price >= bb.upper * 0.998) {
      trades.push({ entryIdx: ci, entry: price, direction: 'SELL',
        stopLoss: bb.upper + atrV, target: bb.middle, reason: `RSI ${rsiVals[i].toFixed(0)} overbought + upper BB` })
    }
  }
  return trades
}

function strategyBollingerBreakout(candles) {
  const closes = candles.map(c => c.close)
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)
  const vols   = candles.map(c => c.volume)
  const bbVals  = bollingerBands(closes, 20)
  const atrVals = atr(highs, lows, closes, 14)
  const trades  = []

  const bbOffset  = closes.length - bbVals.length
  const atrOffset = closes.length - atrVals.length - 1

  for (let i = 1; i < bbVals.length - 1; i++) {
    const ci   = i + bbOffset
    const bb   = bbVals[i]
    const bbPrev = bbVals[i-1]
    const atrV = atrVals[Math.max(0, ci + atrOffset)]
    if (!atrV) continue

    const price = candles[ci].close
    // Volume confirmation: current > 1.5x avg of last 20
    const volAvg = vols.slice(Math.max(0, ci-20), ci).reduce((a,b)=>a+b,0) / 20
    const volOk  = vols[ci] > volAvg * 1.5

    // BUY breakout above upper band
    if (price > bb.upper && candles[ci-1]?.close <= bbPrev.upper && volOk) {
      trades.push({ entryIdx: ci, entry: price, direction: 'BUY',
        stopLoss: bb.middle, target: bb.upper + (bb.upper - bb.middle),
        reason: `BB breakout above ${bb.upper.toFixed(0)} with ${(vols[ci]/volAvg).toFixed(1)}x volume` })
    }
    // SELL breakdown below lower band
    if (price < bb.lower && candles[ci-1]?.close >= bbPrev.lower && volOk) {
      trades.push({ entryIdx: ci, entry: price, direction: 'SELL',
        stopLoss: bb.middle, target: bb.lower - (bb.middle - bb.lower),
        reason: `BB breakdown below ${bb.lower.toFixed(0)} with ${(vols[ci]/volAvg).toFixed(1)}x volume` })
    }
  }
  return trades
}

function strategyMACDCross(candles) {
  const closes  = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const { macd: macdVals, signal: signalVals, hist } = macdLine(closes)
  const atrVals = atr(highs, lows, closes, 14)
  const trades  = []

  const offset    = closes.length - hist.length
  const atrOffset = closes.length - atrVals.length - 1

  for (let i = 1; i < hist.length - 1; i++) {
    const ci   = i + offset
    const atrV = atrVals[Math.max(0, ci + atrOffset)]
    if (!atrV) continue
    const price = candles[ci].close

    // BUY: MACD histogram turns positive (crosses above signal)
    if (hist[i] > 0 && hist[i-1] <= 0) {
      trades.push({ entryIdx: ci, entry: price, direction: 'BUY',
        stopLoss: price - atrV * 1.5, target: price + atrV * 2.5,
        reason: 'MACD crossed above signal line' })
    }
    // SELL: MACD histogram turns negative
    if (hist[i] < 0 && hist[i-1] >= 0) {
      trades.push({ entryIdx: ci, entry: price, direction: 'SELL',
        stopLoss: price + atrV * 1.5, target: price - atrV * 2.5,
        reason: 'MACD crossed below signal line' })
    }
  }
  return trades
}

const STRATEGIES = {
  'ema-cross':    { fn: strategyEMACrossover,   name: 'EMA 9/21 Crossover' },
  'rsi-reversal': { fn: strategyRSIReversal,     name: 'RSI Reversal + Bollinger' },
  'bb-breakout':  { fn: strategyBollingerBreakout, name: 'Bollinger Breakout' },
  'macd-cross':   { fn: strategyMACDCross,       name: 'MACD Crossover' },
}

// ── Simulate trades against candle data ───────────────────────
function simulateTrades(candles, signals, market) {
  const base    = BASE_CAPITAL[market] || 10000
  const riskAmt = base * (RISK_PCT / 100)  // ₹100 or $10
  const trades  = []

  for (const sig of signals) {
    const { entryIdx, entry, stopLoss, target, direction, reason } = sig
    if (!entry || !stopLoss || !target) continue

    const slDist = Math.abs(entry - stopLoss)
    if (slDist <= 0) continue

    const qty    = Math.max(1, Math.floor(riskAmt / slDist))
    const rr     = parseFloat((Math.abs(target - entry) / slDist).toFixed(2))

    // Scan forward candles to find if SL or target hit
    let exitIdx    = null
    let exitPrice  = null
    let exitReason = 'OPEN'

    for (let i = entryIdx + 1; i < candles.length; i++) {
      const c = candles[i]
      if (direction === 'BUY') {
        if (c.low <= stopLoss)  { exitIdx=i; exitPrice=stopLoss; exitReason='SL_HIT'; break }
        if (c.high >= target)   { exitIdx=i; exitPrice=target;   exitReason='TARGET_HIT'; break }
      } else {
        if (c.high >= stopLoss) { exitIdx=i; exitPrice=stopLoss; exitReason='SL_HIT'; break }
        if (c.low <= target)    { exitIdx=i; exitPrice=target;   exitReason='TARGET_HIT'; break }
      }
      // Max hold: 20 candles (5 hours on 15min)
      if (i - entryIdx >= 20)  { exitIdx=i; exitPrice=c.close;  exitReason='EXPIRED'; break }
    }

    if (!exitPrice) continue

    const pnlPts  = direction === 'BUY'
      ? (exitPrice - entry) * qty
      : (entry - exitPrice) * qty
    const pnlPct  = parseFloat(((pnlPts / base) * 100).toFixed(4))
    const won     = exitReason === 'TARGET_HIT'

    trades.push({
      entryIdx, exitIdx,
      entryDate:  candles[entryIdx]?.ts || '',
      exitDate:   candles[exitIdx]?.ts  || '',
      direction,  entry, stopLoss, target, exitPrice,
      qty, rr, exitReason,
      pnlPts:  parseFloat(pnlPts.toFixed(4)),
      pnlPct,
      won,
      reason,
    })
  }
  return trades
}

// ── Stats from trades ──────────────────────────────────────────
function calcStats(trades, market) {
  const base   = BASE_CAPITAL[market] || 10000
  const closed = trades.filter(t => t.exitReason !== 'OPEN')
  const wins   = closed.filter(t => t.won)
  const losses = closed.filter(t => !t.won)
  const winRate = closed.length > 0 ? parseFloat(((wins.length/closed.length)*100).toFixed(1)) : 0
  const totalPnlPct = parseFloat(closed.reduce((a,t) => a+t.pnlPct, 0).toFixed(2))
  const avgWinPct   = wins.length   ? parseFloat((wins.reduce((a,t)=>a+t.pnlPct,0)/wins.length).toFixed(4)) : 0
  const avgLossPct  = losses.length ? parseFloat((losses.reduce((a,t)=>a+t.pnlPct,0)/losses.length).toFixed(4)) : 0
  const expectancy  = parseFloat(((winRate/100)*avgWinPct + ((100-winRate)/100)*avgLossPct).toFixed(4))

  // Max drawdown
  let peak = 0, maxDD = 0, cum = 0
  for (const t of closed) {
    cum += t.pnlPct
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxDD) maxDD = dd
  }

  // Equity curve
  const equityCurve = []
  let running = 0
  for (const t of closed) {
    running += t.pnlPct
    equityCurve.push(parseFloat(running.toFixed(2)))
  }

  return {
    totalTrades:    closed.length,
    wins:           wins.length,
    losses:         losses.length,
    winRate,
    totalPnlPct,
    totalPnlAbs:    parseFloat(((totalPnlPct/100)*base).toFixed(2)),
    avgWinPct,
    avgLossPct,
    expectancy,
    maxDrawdownPct: parseFloat(maxDD.toFixed(2)),
    avgRR:          parseFloat((closed.reduce((a,t)=>a+t.rr,0)/Math.max(closed.length,1)).toFixed(2)),
    baseCapital:    base,
    riskPerTrade:   RISK_PCT,
    equityCurve,
  }
}

export default async function handler(req, res) {
  const { symbol, strategy, market = 'india', timeframe = '15min', days = 60, limit = 500 } = req.query

  if (!symbol || !strategy) {
    return res.status(400).json({ error: 'symbol and strategy required',
      strategies: Object.keys(STRATEGIES),
      example: '/api/backtest?symbol=NIFTY&strategy=ema-cross&market=india&timeframe=15min&days=60' })
  }

  const strat = STRATEGIES[strategy]
  if (!strat) {
    return res.status(400).json({ error: `Unknown strategy. Use: ${Object.keys(STRATEGIES).join(', ')}` })
  }

  try {
    // Fetch candles from Supabase
    let candles = []
    if (timeframe === 'daily') {
      const { data } = await sb.from('ohlcv_daily')
        .select('date,open,high,low,close,volume')
        .eq('symbol', symbol).eq('market', market)
        .order('date', { ascending: true })
        .limit(parseInt(limit))
      candles = (data || []).map(c => ({ ...c, ts: c.date }))
    } else {
      const { data } = await sb.from('ohlcv_15min')
        .select('ts,open,high,low,close,volume')
        .eq('symbol', symbol).eq('market', market)
        .order('ts', { ascending: true })
        .limit(parseInt(limit))
      candles = data || []
    }

    if (candles.length < 50) {
      return res.status(200).json({
        status: 'insufficient_data',
        message: `Only ${candles.length} candles available for ${symbol}. Need at least 50. Run backfill first: /api/historical-data?action=backfill`,
        candles: candles.length,
      })
    }

    // Run strategy
    const signals = strat.fn(candles)
    const trades  = simulateTrades(candles, signals, market)
    const stats   = calcStats(trades, market)

    // Cache result in Supabase
    await sb.from('backtest_results').upsert({
      symbol, market, strategy, timeframe,
      period_days:     parseInt(days),
      total_trades:    stats.totalTrades,
      wins:            stats.wins,
      losses:          stats.losses,
      win_rate:        stats.winRate,
      total_pnl_pct:   stats.totalPnlPct,
      max_drawdown_pct:stats.maxDrawdownPct,
      avg_rr:          stats.avgRR,
      expectancy:      stats.expectancy,
      result_json:     JSON.stringify({ stats, trades: trades.slice(-20) }),
    }, { onConflict: 'symbol,strategy,timeframe,period_days' })

    return res.status(200).json({
      status:      'success',
      symbol,      market,
      strategy:    strat.name,
      timeframe,
      candlesUsed: candles.length,
      stats,
      // Return last 30 trades for display (full list could be huge)
      recentTrades: trades.slice(-30).map(t => ({
        entryDate:  t.entryDate?.split('T')[0] || '',
        exitDate:   t.exitDate?.split('T')[0]  || '',
        direction:  t.direction,
        entry:      t.entry,
        exit:       t.exitPrice,
        pnlPct:     t.pnlPct,
        exitReason: t.exitReason,
        rr:         t.rr,
      })),
      equityCurve: stats.equityCurve,
    })

  } catch(err) {
    console.error('[Backtest] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
