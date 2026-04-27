// /api/asset-deep-dive
// Deep analysis of any asset before trading
// Fetches: price history, recent news, sector context, global factors
// Then Claude analyses everything and gives a trading brief

export default async function handler(req, res) {
  const { symbol, market = 'india' } = req.query
  if (!symbol) return res.status(400).json({ error: 'symbol required' })

  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

    // ── Step 1: Fetch price data ──────────────────────────────
    let priceData = {}
    let newsData  = []

    if (market === 'crypto') {
      const SYMS = { BTC:'BTCUSDT', ETH:'ETHUSDT', SOL:'SOLUSDT', BNB:'BNBUSDT', XRP:'XRPUSDT', DOGE:'DOGEUSDT', ADA:'ADAUSDT' }
      const binSym = SYMS[symbol] || `${symbol}USDT`

      const [r24h, r7d, rTicker] = await Promise.all([
        fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=1h&limit=24`),
        fetch(`https://api.binance.us/api/v3/klines?symbol=${binSym}&interval=4h&limit=42`),
        fetch(`https://api.binance.us/api/v3/ticker/24hr?symbol=${binSym}`),
      ])
      const [d24h, d7d, ticker] = await Promise.all([r24h.json(), r7d.json(), rTicker.json()])

      const closes24h = d24h.map(k => parseFloat(k[4]))
      const closes7d  = d7d.map(k => parseFloat(k[4]))
      const high24h   = Math.max(...d24h.map(k => parseFloat(k[2])))
      const low24h    = Math.min(...d24h.map(k => parseFloat(k[3])))
      const price     = parseFloat(ticker.lastPrice)
      const vol24h    = parseFloat(ticker.volume)
      const pct24h    = parseFloat(ticker.priceChangePercent)
      const pct7d     = closes7d.length > 1 ? ((price - closes7d[0]) / closes7d[0] * 100).toFixed(2) : 0

      // RSI
      const c = closes24h
      let g=0,l=0
      for(let i=c.length-15;i<c.length-1;i++){const d=c[i+1]-c[i];if(d>0)g+=d;else l-=d}
      const rsi = parseFloat((100-(100/(1+g/14/(l/14||0.001)))).toFixed(1))

      priceData = { symbol, market:'crypto', price, pct24h, pct7d, high24h, low24h, vol24h, rsi,
        trend: closes24h[closes24h.length-1] > closes24h[0] ? 'uptrend' : 'downtrend',
        volatility: (((high24h-low24h)/price)*100).toFixed(2) }

      // Crypto news
      const nR = await fetch(`https://news.google.com/rss/search?q=${symbol}+cryptocurrency+price+${symbol==='BTC'?'bitcoin':symbol==='ETH'?'ethereum':symbol}&hl=en&gl=US&ceid=US:en`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const nXml = await nR.text()
      const items = nXml.match(/<item>([\s\S]*?)<\/item>/g) || []
      newsData = items.slice(0,8).map(item => {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || ''
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() || ''
        const source  = (item.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim() || ''
        let timeAgo = ''
        try { const m=Math.round((Date.now()-new Date(pubDate).getTime())/60000); timeAgo=m<60?`${m}m ago`:`${Math.round(m/60)}h ago` } catch {}
        return { title, source, timeAgo }
      }).filter(n => n.title.length > 10)

    } else {
      // Indian market
      const yahooMap = { NIFTY:'%5ENSEI', BANKNIFTY:'%5ENSEBANK', SENSEX:'%5EBSESN',
        TCS:'TCS.NS', INFY:'INFY.NS', ICICIBANK:'ICICIBANK.NS', RELIANCE:'RELIANCE.NS',
        HDFCBANK:'HDFCBANK.NS', SBIN:'SBIN.NS', WIPRO:'WIPRO.NS', AXISBANK:'AXISBANK.NS',
        HINDUNILVR:'HINDUNILVR.NS', ITC:'ITC.NS', BAJFINANCE:'BAJFINANCE.NS', LT:'LT.NS' }
      const ticker = yahooMap[symbol] || `${symbol}.NS`

      const [r1d, r3m] = await Promise.all([
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=5d`),
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=90d`),
      ])
      const [d1d, d3m] = await Promise.all([r1d.json(), r3m.json()])

      const result1d = d1d?.chart?.result?.[0]
      const result3m = d3m?.chart?.result?.[0]
      const closes1d = (result1d?.indicators?.quote?.[0]?.close || []).filter(Boolean)
      const closes3m = (result3m?.indicators?.quote?.[0]?.close || []).filter(Boolean)
      const highs1d  = (result1d?.indicators?.quote?.[0]?.high  || []).filter(Boolean)
      const lows1d   = (result1d?.indicators?.quote?.[0]?.low   || []).filter(Boolean)
      const price    = closes1d[closes1d.length-1] || 0
      const prev3m   = closes3m[0] || price
      const pct3m    = ((price-prev3m)/prev3m*100).toFixed(2)
      const pct1w    = closes3m.length>5 ? ((price-closes3m[closes3m.length-6])/closes3m[closes3m.length-6]*100).toFixed(2) : 0
      const high52w  = result3m?.meta?.fiftyTwoWeekHigh || Math.max(...closes3m)
      const low52w   = result3m?.meta?.fiftyTwoWeekLow  || Math.min(...closes3m)

      // RSI
      const c = closes3m.slice(-15)
      let g=0,l=0
      for(let i=0;i<c.length-1;i++){const d=c[i+1]-c[i];if(d>0)g+=d;else l-=d}
      const rsi = parseFloat((100-(100/(1+g/14/(l/14||0.001)))).toFixed(1))

      priceData = { symbol, market:'india', price, pct1w, pct3m, high52w, low52w, rsi,
        high1d: Math.max(...highs1d||[price]), low1d: Math.min(...lows1d||[price]),
        trend: price > (closes3m[closes3m.length-20]||price) ? 'uptrend' : 'downtrend',
        pctFrom52wHigh: (((price-high52w)/high52w)*100).toFixed(1),
        pctFrom52wLow:  (((price-low52w)/low52w)*100).toFixed(1) }

      // Indian stock/index news
      const searchQ = symbol === 'NIFTY' ? 'nifty+sensex+india+stock+market'
                    : symbol === 'BANKNIFTY' ? 'bank+nifty+banking+india'
                    : `${symbol}+NSE+India+stock`
      const nR = await fetch(`https://news.google.com/rss/search?q=${searchQ}&hl=en-IN&gl=IN&ceid=IN:en`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const nXml = await nR.text()
      const items = nXml.match(/<item>([\s\S]*?)<\/item>/g) || []
      newsData = items.slice(0,8).map(item => {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() || ''
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim() || ''
        const source  = (item.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim() || ''
        let timeAgo = ''
        try { const m=Math.round((Date.now()-new Date(pubDate).getTime())/60000); timeAgo=m<60?`${m}m ago`:`${Math.round(m/60)}h ago` } catch {}
        return { title, source, timeAgo }
      }).filter(n => n.title.length > 10)
    }

    // ── Step 2: Claude analyses everything ────────────────────
    const prompt = market === 'crypto'
      ? `You are a professional crypto trader analysing ${symbol} for Jay (FHP228, Ahmedabad). He wants to know if this is a good time to trade this asset.

CURRENT DATA:
Price: $${priceData.price}
24h Change: ${priceData.pct24h}%
7d Change: ${priceData.pct7d}%
24h Range: $${priceData.low24h} - $${priceData.high24h}
RSI (14): ${priceData.rsi}
Trend: ${priceData.trend}
Volatility: ${priceData.volatility}%

RECENT NEWS (last 24 hours):
${newsData.slice(0,6).map((n,i) => `${i+1}. [${n.timeAgo}] ${n.title}`).join('\n')}

Write a concise trading brief for Jay covering:
1. CURRENT SITUATION: What is happening with ${symbol} right now and why (2-3 sentences)
2. NEWS IMPACT: Which recent news items are most important and how they affect price (2-3 sentences)  
3. KEY LEVELS: Important support and resistance to watch (1-2 sentences)
4. TRADING RECOMMENDATION: Should he trade this now, wait, or avoid? What to watch for (2-3 sentences)
5. RISK FACTORS: What could go wrong (1-2 sentences)

Be specific, actionable, and honest. Use numbers. Max 200 words total.`

      : `You are a professional stock market analyst for Indian markets. Jay (FHP228, Ahmedabad) wants a deep analysis of ${symbol} before trading.

CURRENT DATA:
Price: ₹${priceData.price}
1 Week Change: ${priceData.pct1w}%
3 Month Change: ${priceData.pct3m}%
Today's Range: ₹${priceData.low1d} - ₹${priceData.high1d}
52 Week High: ₹${priceData.high52w} (currently ${priceData.pctFrom52wHigh}% away)
52 Week Low: ₹${priceData.low52w} (currently +${priceData.pctFrom52wLow}% from low)
RSI (14): ${priceData.rsi}
Trend: ${priceData.trend}

RECENT NEWS:
${newsData.slice(0,6).map((n,i) => `${i+1}. [${n.timeAgo}] ${n.title}`).join('\n')}

Write a concise trading brief for Jay covering:
1. CURRENT SITUATION: What is happening with ${symbol} and why is it at this level (2-3 sentences)
2. NEWS IMPACT: Key recent developments affecting this stock/index (2-3 sentences)
3. KEY LEVELS: Critical support and resistance levels to watch (1-2 sentences)
4. TRADING RECOMMENDATION: Is this a good time to trade? What setup to look for (2-3 sentences)
5. RISK FACTORS: What events or factors could hurt the trade (1-2 sentences)

Be specific, data-driven, and actionable. Use rupee amounts. Max 200 words total.`

    const aiR = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: 600,
        messages: [{ role:'user', content: prompt }]
      })
    })
    const aiData = await aiR.json()
    const analysis = aiData?.content?.[0]?.text || 'Analysis unavailable'

    return res.status(200).json({
      status:   'success',
      symbol, market,
      priceData,
      news:     newsData.slice(0, 8),
      analysis,
      generatedAt: new Date().toISOString(),
    })
  } catch(err) {
    console.error('Deep dive error:', err)
    return res.status(500).json({ error: err.message })
  }
}
