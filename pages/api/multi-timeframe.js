// /api/multi-timeframe
// Checks if signal aligns across 15m, 1h and 1D timeframes
// Returns confluence score and recommendation

export default async function handler(req, res) {
  const { symbol = 'NIFTY', market = 'india' } = req.query

  try {
    let results = {}

    if (market === 'crypto') {
      const SYMS = { BTC:'BTCUSDT', ETH:'ETHUSDT', SOL:'SOLUSDT', BNB:'BNBUSDT', XRP:'XRPUSDT' }
      const binSym = SYMS[symbol] || `${symbol}USDT`

      const [r15m, r1h, r1d] = await Promise.all([
        fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=15m&limit=100`),
        fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=1h&limit=100`),
        fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=1d&limit=50`),
      ])
      const [d15, d1h, d1d] = await Promise.all([r15m.json(), r1h.json(), r1d.json()])

      function analyse(klines, label) {
        const closes = klines.map(k => parseFloat(k[4]))
        const price  = closes[closes.length - 1]
        const k = (p) => { const m = 2/(p+1); let v = closes.slice(0,p).reduce((a,b)=>a+b,0)/p; for(let i=p;i<closes.length;i++) v=closes[i]*m+v*(1-m); return v }
        const ema9 = k(9), ema21 = k(21), ema50 = k(50)
        const trend = ema9 > ema21 && ema21 > ema50 ? 'BULLISH'
                    : ema9 < ema21 && ema21 < ema50 ? 'BEARISH' : 'NEUTRAL'
        let rsi = 0
        { let g=0,l=0; for(let i=closes.length-15;i<closes.length-1;i++){const d=closes[i+1]-closes[i];if(d>0)g+=d;else l-=d} const ag=g/14,al=l/14||0.001; rsi=100-(100/(1+ag/al)) }
        return { label, trend, rsi:parseFloat(rsi.toFixed(1)), ema9:parseFloat(ema9.toFixed(2)), ema21:parseFloat(ema21.toFixed(2)), ema50:parseFloat(ema50.toFixed(2)), price:parseFloat(price.toFixed(2)) }
      }

      results = {
        '15m': analyse(d15, '15 Min'),
        '1h':  analyse(d1h,  '1 Hour'),
        '1d':  analyse(d1d,  '1 Day'),
      }
    } else {
      // Indian market - Yahoo Finance
      const yahooMap = { NIFTY:'%5ENSEI', BANKNIFTY:'%5ENSEBANK', TCS:'TCS.NS', INFY:'INFY.NS', SBIN:'SBIN.NS', RELIANCE:'RELIANCE.NS', HDFCBANK:'HDFCBANK.NS', ICICIBANK:'ICICIBANK.NS' }
      const ticker = yahooMap[symbol] || `${symbol}.NS`

      const [r15m, r1h, r1d] = await Promise.all([
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=5d`),
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1h&range=30d`),
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=90d`),
      ])
      const [d15, d1h, d1d] = await Promise.all([r15m.json(), r1h.json(), r1d.json()])

      function analyse(data, label) {
        const result = data?.chart?.result?.[0]
        if (!result) return { label, trend: 'NO_DATA', rsi: 0 }
        const closes = (result.indicators.quote[0].close || []).filter(Boolean)
        const price  = closes[closes.length - 1]
        const k = (p) => { const m=2/(p+1); let v=closes.slice(0,p).reduce((a,b)=>a+b,0)/p; for(let i=p;i<closes.length;i++) v=closes[i]*m+v*(1-m); return v }
        const ema9=k(9), ema21=k(21), ema50=k(50)
        const trend = ema9>ema21&&ema21>ema50?'BULLISH':ema9<ema21&&ema21<ema50?'BEARISH':'NEUTRAL'
        let rsi=50
        if(closes.length>15){let g=0,l=0;for(let i=closes.length-15;i<closes.length-1;i++){const d=closes[i+1]-closes[i];if(d>0)g+=d;else l-=d};const ag=g/14,al=l/14||0.001;rsi=100-(100/(1+ag/al))}
        return { label, trend, rsi:parseFloat(rsi.toFixed(1)), ema9:parseFloat(ema9?.toFixed(2)), ema21:parseFloat(ema21?.toFixed(2)), price:parseFloat(price?.toFixed(2)) }
      }

      results = {
        '15m': analyse(d15, '15 Min'),
        '1h':  analyse(d1h,  '1 Hour'),
        '1d':  analyse(d1d,  '1 Day'),
      }
    }

    // Confluence scoring
    const trends    = Object.values(results).map(r => r.trend)
    const bullCount = trends.filter(t => t === 'BULLISH').length
    const bearCount = trends.filter(t => t === 'BEARISH').length

    let confluence, signal, recommendation, color
    if (bullCount === 3) {
      confluence = 'FULL BULLISH'; signal = 'BUY'; color = '#10b981'
      recommendation = 'All 3 timeframes bullish — highest confidence long setup. EMA alignment confirmed on 15m, 1h and 1D.'
    } else if (bearCount === 3) {
      confluence = 'FULL BEARISH'; signal = 'SELL'; color = '#ef4444'
      recommendation = 'All 3 timeframes bearish — highest confidence short setup. Downtrend confirmed across all timeframes.'
    } else if (bullCount === 2) {
      confluence = 'MOSTLY BULLISH'; signal = 'BUY'; color = '#34d399'
      recommendation = '2/3 timeframes bullish — good setup. Wait for 15m to confirm or enter with smaller size.'
    } else if (bearCount === 2) {
      confluence = 'MOSTLY BEARISH'; signal = 'SELL'; color = '#f87171'
      recommendation = '2/3 timeframes bearish — decent short setup. Confirm with 15m momentum before entry.'
    } else {
      confluence = 'MIXED'; signal = 'HOLD'; color = '#f59e0b'
      recommendation = 'Timeframes conflict — no clear edge. Wait for alignment before taking a position.'
    }

    const score = signal === 'BUY' ? bullCount : signal === 'SELL' ? bearCount : 0

    return res.status(200).json({
      status: 'success',
      symbol, market,
      confluence, signal, color,
      score, maxScore: 3,
      recommendation,
      timeframes: results,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
