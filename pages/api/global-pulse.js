// /api/global-pulse
// Fetches ALL global data that affects Indian + Crypto markets
// US markets, SGX Nifty, DXY, Crude, Gold, Asian markets, Crypto
// All free via Yahoo Finance

export default async function handler(req, res) {
  try {
    const symbols = [
      // US Markets (affects Indian sentiment directly)
      '%5EGSPC',   // S&P 500
      '%5EIXIC',   // NASDAQ
      '%5EDJI',    // Dow Jones
      '%5EVIX',    // VIX fear index
      '%5ETNX',    // US 10Y bond yield
      // Indian markets
      '%5ENSEI',   // NIFTY 50
      '%5ENSEBANK',// Bank NIFTY
      '%5EBSESN',  // SENSEX
      '%5ECNXIT',  // Nifty IT
      // SGX Nifty (best pre-market India indicator)
      'INF.SI',
      // Commodities (crude = major India factor)
      'CL=F',      // Crude WTI
      'BZ=F',      // Brent Crude
      'GC=F',      // Gold
      'SI=F',      // Silver
      'NG=F',      // Natural Gas
      // Currencies (USDINR crucial for markets)
      'DX-Y.NYB',  // Dollar Index
      'INR=X',     // USD/INR
      'EURUSD=X',  // EUR/USD
      'USDJPY=X',  // USD/JPY
      // Asian Markets (open before India)
      '%5EN225',   // Nikkei 225
      '%5EHSI',    // Hang Seng
      '000001.SS', // Shanghai
      '%5EKS11',   // KOSPI Korea
      // Crypto
      'BTC-USD',
      'ETH-USD',
    ]

    const r = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,shortName,regularMarketTime`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    const data  = await r.json()
    const quotes = data?.quoteResponse?.result || []

    const q = (sym) => {
      const decoded = decodeURIComponent(sym)
      const found   = quotes.find(q => q.symbol === decoded || q.symbol === sym)
      if (!found) return null
      return {
        price: parseFloat((found.regularMarketPrice || 0).toFixed(4)),
        change: parseFloat((found.regularMarketChange || 0).toFixed(2)),
        pct:    parseFloat((found.regularMarketChangePercent || 0).toFixed(2)),
        prev:   parseFloat((found.regularMarketPreviousClose || 0).toFixed(2)),
        name:   found.shortName || sym,
      }
    }

    // Fetch global news (market-moving headlines)
    const newsFeeds = [
      'https://news.google.com/rss/search?q=india+stock+market+nifty+sensex&hl=en-IN&gl=IN&ceid=IN:en',
      'https://news.google.com/rss/search?q=US+federal+reserve+interest+rates+economy&hl=en&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=crude+oil+price+OPEC+dollar+index&hl=en&gl=US&ceid=US:en',
      'https://news.google.com/rss/search?q=china+economy+FII+foreign+investors+india&hl=en&gl=US&ceid=US:en',
    ]

    const newsResults = await Promise.allSettled(
      newsFeeds.map(url => fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text()))
    )

    const allNews = []
    for (const result of newsResults) {
      if (result.status !== 'fulfilled') continue
      const items = result.value.match(/<item>([\s\S]*?)<\/item>/g) || []
      for (const item of items.slice(0, 5)) {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/))?.[1]?.trim()
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim()
        const source  = (item.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim()
        const link    = (item.match(/<link>(.*?)<\/link>/))?.[1]?.trim()
        if (!title || title.length < 10) continue
        let timeAgo = ''
        try {
          const mins = Math.round((Date.now() - new Date(pubDate).getTime()) / 60000)
          timeAgo = mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`
        } catch {}
        // Sentiment
        const text = title.toLowerCase()
        const bull = ['rise','surge','rally','gain','high','positive','growth','record','up'].filter(w=>text.includes(w)).length
        const bear = ['fall','drop','crash','loss','low','negative','decline','slump','down','weak','concern','fear'].filter(w=>text.includes(w)).length
        allNews.push({ title, source, timeAgo, link, sentiment: bull>bear?'bullish':bear>bull?'bearish':'neutral' })
      }
    }

    // Deduplicate
    const seen = new Set()
    const news  = allNews.filter(n => {
      const k = n.title.slice(0,40)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }).slice(0, 15)

    // Build the pulse object
    const pulse = {
      us: {
        sp500:    q('%5EGSPC'),
        nasdaq:   q('%5EIXIC'),
        dow:      q('%5EDJI'),
        vix:      q('%5EVIX'),
        yield10y: q('%5ETNX'),
      },
      india: {
        nifty:     q('%5ENSEI'),
        banknifty: q('%5ENSEBANK'),
        sensex:    q('%5EBSESN'),
        niftyIT:   q('%5ECNXIT'),
        sgxNifty:  q('INF.SI'),
        usdinr:    q('INR=X'),
      },
      commodities: {
        crude:   q('CL=F'),
        brent:   q('BZ=F'),
        gold:    q('GC=F'),
        silver:  q('SI=F'),
        natgas:  q('NG=F'),
      },
      currencies: {
        dxy:    q('DX-Y.NYB'),
        usdinr: q('INR=X'),
        eurusd: q('EURUSD=X'),
        usdjpy: q('USDJPY=X'),
      },
      asia: {
        nikkei:   q('%5EN225'),
        hangseng: q('%5EHSI'),
        shanghai: q('000001.SS'),
        kospi:    q('%5EKS11'),
      },
      crypto: {
        btc: q('BTC-USD'),
        eth: q('ETH-USD'),
      },
      news,
      fetchedAt: new Date().toISOString(),
    }

    // Risk assessment for India open
    const signals = []
    if (pulse.us.sp500?.pct < -0.5) signals.push({ factor:'S&P 500', value:`${pulse.us.sp500.pct}%`, impact:'bearish', note:'US weakness → Indian open likely weak' })
    if (pulse.us.sp500?.pct > 0.5)  signals.push({ factor:'S&P 500', value:`+${pulse.us.sp500.pct}%`, impact:'bullish', note:'US strength → Indian open likely positive' })
    if (pulse.us.vix?.price > 25)   signals.push({ factor:'VIX', value:pulse.us.vix.price, impact:'bearish', note:'High fear index — volatile session expected' })
    if (pulse.commodities.crude?.pct > 2)  signals.push({ factor:'Crude Oil', value:`+${pulse.commodities.crude.pct}%`, impact:'bearish', note:'Crude spike → inflation fear, OMC stocks weak' })
    if (pulse.commodities.crude?.pct < -2) signals.push({ factor:'Crude Oil', value:`${pulse.commodities.crude.pct}%`, impact:'bullish', note:'Crude drop → positive for India (import relief)' })
    if (pulse.currencies.dxy?.pct > 0.3)   signals.push({ factor:'Dollar Index', value:`+${pulse.currencies.dxy.pct}%`, impact:'bearish', note:'Strong dollar → USDINR up → FII outflows' })
    if (pulse.currencies.usdinr?.price > 84.5) signals.push({ factor:'USDINR', value:pulse.currencies.usdinr.price, impact:'bearish', note:'Rupee weak → import pressure, FII exits' })
    if (pulse.asia.nikkei?.pct < -1) signals.push({ factor:'Nikkei', value:`${pulse.asia.nikkei.pct}%`, impact:'bearish', note:'Asian weakness → negative sentiment' })
    if (pulse.asia.hangseng?.pct < -1) signals.push({ factor:'Hang Seng', value:`${pulse.asia.hangseng.pct}%`, impact:'bearish', note:'China weakness → global risk-off' })
    if (pulse.commodities.gold?.pct > 1) signals.push({ factor:'Gold', value:`+${pulse.commodities.gold.pct}%`, impact:'neutral', note:'Gold rising → risk-off sentiment, defensive play' })

    const bullishCount = signals.filter(s=>s.impact==='bullish').length
    const bearishCount = signals.filter(s=>s.impact==='bearish').length
    const globalSentiment = bearishCount > bullishCount+1 ? 'BEARISH'
                          : bullishCount > bearishCount+1 ? 'BULLISH' : 'NEUTRAL'

    return res.status(200).json({
      status: 'success',
      globalSentiment,
      signals,
      pulse,
      news,
      fetchedAt: new Date().toISOString(),
    })
  } catch(err) {
    console.error('Global pulse error:', err)
    return res.status(500).json({ error: err.message })
  }
}
