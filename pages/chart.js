// pages/chart.js
// Fullscreen chart page — opens our own PZChart in full screen
// No Kite iframe issues, works perfectly
import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const DARK = {
  bg:'#07090f', surface:'#0d1117', card:'#111827', border:'#1f2937',
  text:'#f9fafb', text2:'#9ca3af', muted:'#4b5563',
  green:'#10f59e', red:'#ff4466', blue:'#3b9eff', amber:'#fbbf24',
  accentC:'#3b9eff', glow:'0 0 0 1px #1f2937',
}

const INTERVALS = [
  {v:'minute',   l:'1m',  days:1,   refresh:5},
  {v:'3minute',  l:'3m',  days:2,   refresh:10},
  {v:'5minute',  l:'5m',  days:3,   refresh:10},
  {v:'10minute', l:'10m', days:5,   refresh:15},
  {v:'15minute', l:'15m', days:5,   refresh:20},
  {v:'30minute', l:'30m', days:10,  refresh:30},
  {v:'60minute', l:'1h',  days:30,  refresh:60},
  {v:'day',      l:'1D',  days:365, refresh:300},
  {v:'week',     l:'1W',  days:730, refresh:600},
]

const fmt = (n, d=2) => n != null ? Number(n).toLocaleString('en-IN',{maximumFractionDigits:d}) : '—'

export default function FullChart() {
  const router = useRouter()
  const { symbol: sym } = router.query
  const symbol = sym || 'NIFTY'

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [intv,    setIntv]    = useState('15minute')
  const [last,    setLast]    = useState(null)
  const [live,    setLive]    = useState(true)
  const [updated, setUpdated] = useState(null)
  const [source,  setSource]  = useState('')
  const chartRef  = typeof window !== 'undefined' ? require('react').useRef(null) : null
  const tvRef     = typeof window !== 'undefined' ? require('react').useRef(null) : null
  const serRef    = typeof window !== 'undefined' ? require('react').useRef(null) : null
  const volRef    = typeof window !== 'undefined' ? require('react').useRef(null) : null
  const timerRef  = typeof window !== 'undefined' ? require('react').useRef(null) : null
  const cfg = INTERVALS.find(i=>i.v===intv) || INTERVALS[4]
  const t = DARK

  async function loadData(silent=false) {
    if (!silent) setLoading(true)
    try {
      const at = localStorage.getItem('kite_access_token') || ''
      const r = await fetch(`/api/kite-chart?symbol=${symbol}&interval=${intv}&days=${cfg.days}`,
        {headers: at ? {'x-kite-access-token':at} : {}})
      const d = await r.json()
      if (d.candles?.length > 0) {
        setCandles(d.candles); setSource(d.source); setLast(d.last); setUpdated(new Date())
        if (silent && serRef?.current) {
          const s=[...d.candles].sort((a,b)=>a.time-b.time)
          const u=s.filter((c,i)=>i===0||c.time!==s[i-1].time)
          serRef.current.setData(u)
          if (volRef?.current) volRef.current.setData(u.map(c=>({time:c.time,value:c.volume||0,color:c.close>=c.open?'#10f59e33':'#ff446633'})))
        }
      }
    } catch {}
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    if (!symbol) return
    loadData()
    if (timerRef?.current) clearInterval(timerRef.current)
    if (live && timerRef) timerRef.current = setInterval(()=>loadData(true), cfg.refresh*1000)
    return () => { if (timerRef?.current) clearInterval(timerRef.current) }
  }, [symbol, intv, live])

  useEffect(() => {
    if (!candles.length || !chartRef?.current || loading) return
    if (!window.LightweightCharts) {
      const s=document.createElement('script')
      s.src='https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
      s.onload=()=>renderChart(); document.head.appendChild(s)
    } else renderChart()
  }, [candles])

  function renderChart() {
    if (!window.LightweightCharts || !chartRef?.current) return
    if (tvRef?.current) { try{tvRef.current.remove()}catch{} tvRef.current=null }
    chartRef.current.innerHTML=''
    const chart=window.LightweightCharts.createChart(chartRef.current,{
      width:chartRef.current.clientWidth||window.innerWidth,
      height:window.innerHeight-130,
      layout:{background:{color:'#0d1117'},textColor:'#9ca3af',fontSize:12},
      grid:{vertLines:{color:'#1f293755'},horzLines:{color:'#1f293755'}},
      crosshair:{mode:1},
      rightPriceScale:{borderColor:'#1f2937',scaleMargins:{top:0.06,bottom:0.2}},
      timeScale:{borderColor:'#1f2937',timeVisible:true,secondsVisible:intv==='minute'},
    })
    const series=chart.addCandlestickSeries({
      upColor:'#10f59e',downColor:'#ff4466',
      borderUpColor:'#10f59e',borderDownColor:'#ff4466',
      wickUpColor:'#10f59e99',wickDownColor:'#ff446699',
    })
    const vol=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol'})
    chart.priceScale('vol').applyOptions({scaleMargins:{top:0.84,bottom:0}})
    const sorted=[...candles].sort((a,b)=>a.time-b.time)
    const deduped=sorted.filter((c,i)=>i===0||c.time!==sorted[i-1].time)
    series.setData(deduped)
    vol.setData(deduped.map(c=>({time:c.time,value:c.volume||0,color:c.close>=c.open?'#10f59e33':'#ff446633'})))
    chart.timeScale().fitContent()
    if (tvRef) tvRef.current=chart
    if (serRef) serRef.current=series
    if (volRef) volRef.current=vol
    const ro=new ResizeObserver(()=>{if(chartRef?.current)chart.applyOptions({width:chartRef.current.clientWidth,height:window.innerHeight-130})})
    ro.observe(document.body)
  }

  const chg    = last ? ((last.close-last.open)/last.open*100) : 0
  const isUp   = chg >= 0
  const secAgo = updated ? Math.round((new Date()-updated)/1000) : null
  const ALL_SYMS = ['NIFTY','BANKNIFTY','SENSEX','TCS','INFY','ICICIBANK','RELIANCE','HDFCBANK','SBIN','WIPRO']

  return (
    <>
      <Head>
        <title>{symbol} Chart — Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:'#07090f',fontFamily:'Space Grotesk,sans-serif',color:'#f9fafb',display:'flex',flexDirection:'column'}}>
        {/* Header */}
        <div style={{background:'rgba(13,17,23,0.95)',borderBottom:'1px solid #1f2937',padding:'0 16px',height:56,display:'flex',alignItems:'center',gap:12,flexShrink:0,backdropFilter:'blur(12px)'}}>
          {/* Back */}
          <button onClick={()=>window.close()} style={{background:'#1f2937',border:'none',borderRadius:8,color:'#9ca3af',cursor:'pointer',fontSize:13,padding:'5px 12px',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,display:'flex',alignItems:'center',gap:5}}>
            ← Close
          </button>

          {/* Symbol selector */}
          <div style={{display:'flex',gap:4,overflowX:'auto'}}>
            {ALL_SYMS.map(s=>(
              <button key={s} onClick={()=>router.replace(`/chart?symbol=${s}`)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,background:symbol===s?t.accentC:t.surface,border:`1px solid ${symbol===s?t.accentC:t.border}`,color:symbol===s?'#fff':t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',flexShrink:0,whiteSpace:'nowrap'}}>{s}</button>
            ))}
          </div>

          {/* Price */}
          {last && (
            <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto',flexShrink:0}}>
              <span style={{color:'#f9fafb',fontWeight:800,fontSize:16,fontFamily:'JetBrains Mono,monospace'}}>₹{fmt(last.close)}</span>
              <span style={{fontSize:12,fontWeight:700,color:isUp?t.green:t.red,background:(isUp?t.green:t.red)+'18',borderRadius:5,padding:'2px 8px'}}>{isUp?'+':''}{fmt(chg,2)}%</span>
              <span style={{color:t.muted,fontSize:10}}>{source==='kite'?'🟢 Live':'⚪ Yahoo'}{secAgo!=null?` · ${secAgo}s`:''}</span>
            </div>
          )}

          {/* Live toggle + refresh */}
          <div style={{display:'flex',gap:6,flexShrink:0}}>
            <button onClick={()=>setLive(v=>!v)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:live?t.green+'22':t.surface,border:`1px solid ${live?t.green:t.border}`,color:live?t.green:t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
              {live?`⚡ ${cfg.refresh}s`:'⏸'}
            </button>
            <button onClick={()=>loadData()} style={{padding:'4px 8px',borderRadius:6,fontSize:14,background:'none',border:`1px solid ${t.border}`,color:t.muted,cursor:'pointer'}}>↻</button>
          </div>
        </div>

        {/* Interval bar */}
        <div style={{background:'#0d1117',borderBottom:'1px solid #1f293744',padding:'6px 16px',display:'flex',gap:4,flexShrink:0}}>
          {INTERVALS.map(i=>(
            <button key={i.v} onClick={()=>setIntv(i.v)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:700,background:intv===i.v?t.accentC:'transparent',border:`1px solid ${intv===i.v?t.accentC:'transparent'}`,color:intv===i.v?'#fff':t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',transition:'all 0.1s'}}>{i.l}</button>
          ))}
        </div>

        {/* Chart */}
        <div style={{flex:1,position:'relative',background:'#0d1117'}}>
          {loading
            ? <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
                <div style={{width:40,height:40,border:'3px solid #1f2937',borderTopColor:t.accentC,borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
                <p style={{color:t.muted,fontSize:13}}>Loading {cfg.l} chart for {symbol}...</p>
              </div>
            : <div ref={chartRef} style={{width:'100%',height:'100%'}} />
          }
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-thumb{background:#374151;border-radius:2px}`}</style>
    </>
  )
}
