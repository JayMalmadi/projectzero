// /api/news
// Market news from Google News RSS + Economic Times RSS
// No API key needed — completely free

export default async function handler(req, res) {
  const { market = 'india' } = req.query

  try {
    const feeds = market === 'crypto'
      ? [
          'https://news.google.com/rss/search?q=bitcoin+ethereum+crypto+market&hl=en&gl=US&ceid=US:en',
          'https://news.google.com/rss/search?q=cryptocurrency+binance+market&hl=en&gl=US&ceid=US:en',
        ]
      : [
          'https://news.google.com/rss/search?q=nifty+sensex+stock+market+india&hl=en-IN&gl=IN&ceid=IN:en',
          'https://news.google.com/rss/search?q=zerodha+NSE+BSE+india+trading&hl=en-IN&gl=IN&ceid=IN:en',
        ]

    const results = await Promise.allSettled(feeds.map(url => fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
    }).then(r => r.text())))

    const allItems = []

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const xml  = result.value
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

      for (const item of items.slice(0, 8)) {
        const title   = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                         item.match(/<title>(.*?)<\/title>/))?.[1]?.trim()
        const link    = (item.match(/<link>(.*?)<\/link>/))?.[1]?.trim()
        const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/))?.[1]?.trim()
        const source  = (item.match(/<source[^>]*>(.*?)<\/source>/))?.[1]?.trim()

        if (!title || title.length < 10) continue

        // Sentiment scoring
        const text  = title.toLowerCase()
        const bull  = ['rise','surge','rally','gain','bull','up','high','positive','growth','record','profit'].filter(w => text.includes(w)).length
        const bear  = ['fall','drop','crash','loss','bear','down','low','negative','decline','slump','weak'].filter(w => text.includes(w)).length
        const sentiment = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral'
        const sentEmoji = sentiment === 'bullish' ? '🟢' : sentiment === 'bearish' ? '🔴' : '⚪'

        // Parse date
        let timeAgo = ''
        try {
          const d   = new Date(pubDate)
          const mins = Math.round((Date.now() - d.getTime()) / 60000)
          timeAgo   = mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`
        } catch {}

        allItems.push({ title, link, source, sentiment, sentEmoji, timeAgo, pubDate })
      }
    }

    // Deduplicate and sort by time
    const seen = new Set()
    const unique = allItems.filter(item => {
      const key = item.title.slice(0, 40)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 10)

    return res.status(200).json({
      status:  'success',
      market,
      count:   unique.length,
      news:    unique,
      updatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message, news: [] })
  }
}
