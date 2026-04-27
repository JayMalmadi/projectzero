// pages/chart.js
// Universal fullscreen chart — Indian markets (Kite) + Crypto (Binance)
// Opens from both signal cards and chart tabs

import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const DARK = {
  bg:'#080c14', surface:'#0e1420', card:'#111927', border:'#1c2535',
  text:'#f0f4fc', text2:'#8b95a8', muted:'#4a5568',
  green:'#00d17a', red:'#ff4060', blue:'#4da6ff', amber:'#ffaa00',
  orange:'#ff7a00', accentC:'#ff7a00',
}

// Indian market intervals (Kite API format)
const INDIA_INTERVALS = [
  {v:'minute',   l:'1m',  days:1,   refresh:2},
  {v:'3minute',  l:'3m',  days:2,   refresh:3},
  {v:'5minute',  l:'5m',  days:3,   refresh:3},
  {v:'10minute', l:'10m', days:5,   refresh:5},
  {v:'15minute', l:'15m', days:5,   refresh:5},
  {v:'30minute', l:'30m', days:10,  refresh:10},
  {v:'60minute', l:'1h',  days:30,  refresh:30},
  {v:'day',      l:'1D',  days:365, refresh:60},
  {v:'week',     l:'1W',  days:730, refresh:300},
]

// Crypto intervals (Binance format)
const CRYPTO_INTERVALS = [
  {v:'1m',  l:'1m',  refresh:2},
  {v:'3m',  l:'3m',  refresh:3},
  {v:'5m',  l:'5m',  refresh:5},
  {v:'15m', l:'15m', refresh:5},
  {v:'30m', l:'30m', refresh:10},
  {v:'1h',  l:'1h',  refresh:30},
  {v:'4h',  l:'4h',  refresh:60},
  {v:'1d',  l:'1D',  refresh:120},
  {v:'1w',  l:'1W',  refresh:300},
]


// External app chart URLs
const KITE_URLS = {
  NIFTY:    'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%2050/INDICES',
  BANKNIFTY:'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%20BANK/INDICES',
  SENSEX:   'https://kite.zerodha.com/chart/web/ciq/INDICES/SENSEX/INDICES',
  TCS:      'https://kite.zerodha.com/chart/web/ciq/NSE/TCS/EQ',
  INFY:     'https://kite.zerodha.com/chart/web/ciq/NSE/INFY/EQ',
  ICICIBANK:'https://kite.zerodha.com/chart/web/ciq/NSE/ICICIBANK/EQ',
  RELIANCE: 'https://kite.zerodha.com/chart/web/ciq/NSE/RELIANCE/EQ',
  HDFCBANK: 'https://kite.zerodha.com/chart/web/ciq/NSE/HDFCBANK/EQ',
  SBIN:     'https://kite.zerodha.com/chart/web/ciq/NSE/SBIN/EQ',
  WIPRO:    'https://kite.zerodha.com/chart/web/ciq/NSE/WIPRO/EQ',
}
const BINANCE_URLS = {
  BTC: 'https://www.binance.com/en/trade/BTC_USDT?type=spot',
  ETH: 'https://www.binance.com/en/trade/ETH_USDT?type=spot',
  SOL: 'https://www.binance.com/en/trade/SOL_USDT?type=spot',
  BNB: 'https://www.binance.com/en/trade/BNB_USDT?type=spot',
  XRP: 'https://www.binance.com/en/trade/XRP_USDT?type=spot',
  DOGE:'https://www.binance.com/en/trade/DOGE_USDT?type=spot',
  ADA: 'https://www.binance.com/en/trade/ADA_USDT?type=spot',
}

const INDIA_SYMS  = ['NIFTY','BANKNIFTY','SENSEX','TCS','INFY','ICICIBANK','RELIANCE','HDFCBANK','SBIN','WIPRO']
const CRYPTO_SYMS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA']

const fmt = (n, d=2) => n != null ? Number(n).toLocaleString('en-US',{maximumFractionDigits:d}) : '—'
const fmtPrice = (price, market) => {
  if (!price) return '—'
  if (market === 'crypto') return `$${Number(price).toLocaleString('en-US',{maximumFractionDigits:2})}`
  return `₹${Number(price).toLocaleString('en-IN',{maximumFractionDigits:2})}`
}

export default function FullChart() {
  const router  = useRouter()
  const { symbol: sym, market: mkt } = router.query

  const symbol = sym   || 'NIFTY'
  const market = mkt   || 'india'
  const isCrypto = market === 'crypto'

  const INTERVALS = isCrypto ? CRYPTO_INTERVALS : INDIA_INTERVALS
  const ALL_SYMS  = isCrypto ? CRYPTO_SYMS : INDIA_SYMS

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [intv,    setIntv]    = useState(isCrypto ? '15m' : '15minute')
  const [last,    setLast]    = useState(null)
  const [live,    setLive]    = useState(true)
  const [updated, setUpdated] = useState(null)
  const [source,  setSource]  = useState('')
  const chartRef = useRef(null)
  const tvRef    = useRef(null)
  const serRef   = useRef(null)
  const volRef   = useRef(null)
  const timerRef = useRef(null)
  const t = DARK

  const cfg = INTERVALS.find(i => i.v === intv) || INTERVALS[3]

  // Reset interval when market changes
  useEffect(() => {
    setIntv(isCrypto ? '15m' : '15minute')
  }, [market])

  async function loadData(silent=false) {
    if (!silent) setLoading(true)
    try {
      let candles, last, src

      if (isCrypto) {
        // Binance candle data
        const r = await fetch(`/api/binance?action=candles&symbol=${symbol}&interval=${intv}&limit=300`)
        const d = await r.json()
        if (d.candles?.length > 0) {
          candles = d.candles; last = d.last; src = 'binance'
        }
      } else {
        // Kite / Yahoo candle data
        const at = localStorage.getItem('kite_access_token') || ''
        const r  = await fetch(`/api/kite-chart?symbol=${symbol}&interval=${intv}&days=${cfg.days}`,
          { headers: at ? {'x-kite-access-token': at} : {} })
        const d = await r.json()
        if (d.candles?.length > 0) {
          candles = d.candles; last = d.last; src = d.source
        }
      }

      if (candles) {
        setCandles(candles)
        setLast(last)
        setSource(src)
        setUpdated(new Date())
        // Silent update — just update chart data, no re-render
        if (silent && serRef.current) {
          const sorted  = [...candles].sort((a,b) => a.time - b.time)
          const deduped = sorted.filter((c,i) => i===0 || c.time !== sorted[i-1].time)
          serRef.current.setData(deduped)
          if (volRef.current) {
            volRef.current.setData(deduped.map(c => ({
              time:  c.time,
              value: c.volume || 0,
              color: c.close >= c.open ? '#10f59e33' : '#ff446633'
            })))
          }
        }
      }
    } catch(e) { console.error(e) }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    if (!symbol) return
    loadData()
    if (timerRef.current) clearInterval(timerRef.current)
    if (live) timerRef.current = setInterval(() => loadData(true), cfg.refresh * 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [symbol, intv, live, market])

  useEffect(() => {
    if (!candles.length || !chartRef.current || loading) return
    if (!window.LightweightCharts) {
      const s = document.createElement('script')
      s.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
      s.onload = () => renderChart()
      document.head.appendChild(s)
    } else { renderChart() }
  }, [candles])

  function renderChart() {
    if (!window.LightweightCharts || !chartRef.current) return
    if (tvRef.current) { try { tvRef.current.remove() } catch {} tvRef.current = null }
    chartRef.current.innerHTML = ''

    const chart = window.LightweightCharts.createChart(chartRef.current, {
      width:  chartRef.current.clientWidth || window.innerWidth,
      height: window.innerHeight - 130,
      layout: { background:{color:'#0d1117'}, textColor:'#9ca3af', fontSize:12 },
      grid:   { vertLines:{color:'#1f293755'}, horzLines:{color:'#1f293755'} },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor:'#1f2937', scaleMargins:{top:0.06, bottom:0.2} },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
        secondsVisible: intv === 'minute' || intv === '1m',
      },
    })

    const series = chart.addCandlestickSeries({
      upColor:         isCrypto ? '#f59e0b' : '#10f59e',
      downColor:       '#ff4466',
      borderUpColor:   isCrypto ? '#f59e0b' : '#10f59e',
      borderDownColor: '#ff4466',
      wickUpColor:     isCrypto ? '#f59e0b99' : '#10f59e99',
      wickDownColor:   '#ff446699',
    })

    const vol = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins:{top:0.84, bottom:0} })

    const sorted  = [...candles].sort((a,b) => a.time - b.time)
    const deduped = sorted.filter((c,i) => i===0 || c.time !== sorted[i-1].time)

    series.setData(deduped)
    vol.setData(deduped.map(c => ({
      time:  c.time,
      value: c.volume || 0,
      color: c.close >= c.open
        ? (isCrypto ? '#f59e0b33' : '#10f59e33')
        : '#ff446633'
    })))

    chart.timeScale().fitContent()
    tvRef.current  = chart
    serRef.current = series
    volRef.current = vol

    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.applyOptions({
          width:  chartRef.current.clientWidth,
          height: window.innerHeight - 130,
        })
      }
    })
    ro.observe(document.body)
  }

  const chg    = last ? ((last.close - last.open) / last.open * 100) : 0
  const isUp   = chg >= 0
  const secAgo = updated ? Math.round((new Date() - updated) / 1000) : null

  // Switch between India and Crypto markets
  function switchMarket(newMarket) {
    const defaultSym = newMarket === 'crypto' ? 'BTC' : 'NIFTY'
    router.replace(`/chart?symbol=${defaultSym}&market=${newMarket}`)
  }

  function switchSymbol(s) {
    router.replace(`/chart?symbol=${s}&market=${market}`)
  }

  return (
    <>
      <Head>
        <title>{symbol} {isCrypto ? 'USDT' : ''} Chart — Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:'#07090f',fontFamily:'Inter,sans-serif',color:'#f9fafb',display:'flex',flexDirection:'column'}}>

        {/* Header */}
        <div style={{background:'rgba(13,17,23,0.97)',borderBottom:'1px solid #1f2937',padding:'0 16px',height:56,display:'flex',alignItems:'center',gap:10,flexShrink:0}}>

          {/* Close */}
          <button onClick={()=>window.close()} style={{background:'#1f2937',border:'none',borderRadius:8,color:'#9ca3af',cursor:'pointer',fontSize:12,padding:'5px 12px',fontFamily:'Inter,sans-serif',fontWeight:600,flexShrink:0}}>
            ← Close
          </button>

          {/* Market switcher */}
          <div style={{display:'flex',gap:4,flexShrink:0}}>
            <button onClick={()=>switchMarket('india')} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,background:!isCrypto?'#3b9eff':'#1f2937',border:`1px solid ${!isCrypto?'#3b9eff':'#374151'}`,color:!isCrypto?'#fff':'#9ca3af',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
              🇮🇳 India
            </button>
            <button onClick={()=>switchMarket('crypto')} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,background:isCrypto?'#f59e0b':'#1f2937',border:`1px solid ${isCrypto?'#f59e0b':'#374151'}`,color:isCrypto?'#000':'#9ca3af',cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
              🪙 Crypto
            </button>
          </div>

          {/* Symbol pills */}
          <div style={{display:'flex',gap:4,overflowX:'auto',flex:1}}>
            {ALL_SYMS.map(s => (
              <button key={s} onClick={()=>switchSymbol(s)} style={{
                padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,flexShrink:0,
                background: symbol===s ? (isCrypto?'#f59e0b':'#3b9eff') : 'transparent',
                border:`1px solid ${symbol===s?(isCrypto?'#f59e0b':'#3b9eff'):'transparent'}`,
                color: symbol===s ? (isCrypto?'#000':'#fff') : '#9ca3af',
                cursor:'pointer',fontFamily:'Inter,sans-serif',
              }}>{s}</button>
            ))}
          </div>

          {/* Price display */}
          {last && (
            <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
              <span style={{color:'#f9fafb',fontWeight:800,fontSize:15,fontFamily:'JetBrains Mono,monospace'}}>
                {fmtPrice(last.close, market)}
              </span>
              <span style={{fontSize:12,fontWeight:700,color:isUp?t.green:t.red,background:(isUp?t.green:t.red)+'18',borderRadius:5,padding:'2px 8px'}}>
                {isUp?'+':''}{fmt(chg,2)}%
              </span>
              <span style={{color:t.muted,fontSize:10}}>
                {source==='binance'?'🟡 Binance':source==='kite'?'🟢 Kite':'⚪ Yahoo'}
                {secAgo!=null?` · ${secAgo}s`:''}
              </span>
            </div>
          )}

          {/* Live toggle + refresh */}
          <div style={{display:'flex',gap:6,flexShrink:0}}>
            <button onClick={()=>setLive(v=>!v)} style={{
              padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:700,
              background: live ? (isCrypto?'#f59e0b22':'#10f59e22') : '#1f2937',
              border:`1px solid ${live?(isCrypto?'#f59e0b':'#10f59e'):'#374151'}`,
              color: live ? (isCrypto?'#f59e0b':'#10f59e') : '#9ca3af',
              cursor:'pointer',fontFamily:'Inter,sans-serif',
            }}>
              {live ? `⚡ ${cfg.refresh}s` : '⏸'}
            </button>
            <button onClick={()=>loadData()} style={{padding:'4px 8px',borderRadius:6,fontSize:14,background:'none',border:'1px solid #374151',color:'#9ca3af',cursor:'pointer'}}>↻</button>

          {isCrypto
            ? (BINANCE_URLS[symbol] &&
              <button onClick={()=>window.open(BINANCE_URLS[symbol],'_blank')} style={{padding:'5px 12px',borderRadius:6,fontSize:11,fontWeight:700,background:'#f59e0b22',border:'1px solid #f59e0b66',color:'#f59e0b',cursor:'pointer',fontFamily:'Inter,sans-serif',flexShrink:0}}>
                🔗 Binance ↗
              </button>)
            : (KITE_URLS[symbol] &&
              <button onClick={()=>window.open(KITE_URLS[symbol],'_blank')} style={{padding:'5px 12px',borderRadius:6,fontSize:11,fontWeight:700,background:'#ff922b22',border:'1px solid #ff922b66',color:'#ff922b',cursor:'pointer',fontFamily:'Inter,sans-serif',flexShrink:0}}>
                🔗 Kite ↗
              </button>)
          }
        </div>
      </div>

      {/* Interval bar */}
        <div style={{background:'#0d1117',borderBottom:'1px solid #1f293744',padding:'6px 16px',display:'flex',gap:4,flexShrink:0}}>
          {INTERVALS.map(i => (
            <button key={i.v} onClick={()=>setIntv(i.v)} style={{
              padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,
              background: intv===i.v ? (isCrypto?'#f59e0b':'#3b9eff') : 'transparent',
              border:`1px solid ${intv===i.v?(isCrypto?'#f59e0b':'#3b9eff'):'transparent'}`,
              color: intv===i.v ? (isCrypto?'#000':'#fff') : '#9ca3af',
              cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all 0.1s',
            }}>{i.l}</button>
          ))}
        </div>

        {/* Chart */}
        <div style={{flex:1,position:'relative',background:'#0d1117'}}>
          {loading
            ? <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
                <div style={{width:40,height:40,border:`3px solid #1f2937`,borderTopColor:isCrypto?'#f59e0b':'#3b9eff',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
                <p style={{color:'#4b5563',fontSize:13}}>Loading {cfg.l} chart for {symbol}{isCrypto?' (Binance)':''}...</p>
              </div>
            : <div ref={chartRef} style={{width:'100%',height:'100%'}} />
          }
        </div>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:#374151;border-radius:2px}
      `}</style>
    </>
  )
}
