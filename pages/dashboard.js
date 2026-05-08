import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const fmt = (n,d=2) => n!=null ? Number(n).toLocaleString('en-IN',{maximumFractionDigits:d}) : '—'
const clr = (v,t) => v>0?t.green:v<0?t.red:t.muted

// Kite search URLs - searches for symbol directly in Kite dashboard
const KITE_SEARCH = {
  NIFTY:    'https://kite.zerodha.com/dashboard#chart/NSE/NIFTY%2050/INDICES',
  BANKNIFTY:'https://kite.zerodha.com/dashboard#chart/NSE/NIFTY%20BANK/INDICES',
  SENSEX:   'https://kite.zerodha.com/dashboard#chart/BSE/SENSEX/INDICES',
  TCS:      'https://kite.zerodha.com/dashboard#chart/NSE/TCS/EQ',
  INFY:     'https://kite.zerodha.com/dashboard#chart/NSE/INFY/EQ',
  ICICIBANK:'https://kite.zerodha.com/dashboard#chart/NSE/ICICIBANK/EQ',
  RELIANCE: 'https://kite.zerodha.com/dashboard#chart/NSE/RELIANCE/EQ',
  HDFCBANK: 'https://kite.zerodha.com/dashboard#chart/NSE/HDFCBANK/EQ',
  SBIN:     'https://kite.zerodha.com/dashboard#chart/NSE/SBIN/EQ',
  WIPRO:    'https://kite.zerodha.com/dashboard#chart/NSE/WIPRO/EQ',
}

const DARK = {
  // Deep navy dark theme — premium feel
  bg:'#080c14', surface:'#0e1420', card:'#111927', border:'#1c2535', border2:'#243040',
  text:'#f0f4fc', text2:'#8b95a8', muted:'#4a5568',
  green:'#00d17a', red:'#ff4060', blue:'#4da6ff', amber:'#ffaa00', purple:'#9f7eff', teal:'#00cdb8',
  orange:'#ff7a00',
  accent:'linear-gradient(135deg,#ff7a00,#ffaa00)', accentC:'#ff7a00',
  glow:'0 0 0 1px #1c2535,0 8px 32px rgba(0,0,0,0.6)', tickBg:'#060a12',
}
const LIGHT = {
  // Crisp white + orange — clean, modern, easy on eyes
  bg:'#fafafa', surface:'#ffffff', card:'#ffffff', border:'#ebebeb', border2:'#d8d8d8',
  text:'#1a1a2e', text2:'#555e6e', muted:'#9aa0ad',
  green:'#00b068', red:'#e8334a', blue:'#0066ff', amber:'#ff8c00', purple:'#7c4dff', teal:'#00a896',
  orange:'#ff6600',
  accent:'linear-gradient(135deg,#ff6600,#ff9500)', accentC:'#ff6600',
  glow:'0 1px 4px rgba(0,0,0,0.08),0 4px 20px rgba(0,0,0,0.05)', tickBg:'#f5f5f5',
}

function Badge({children,color}) {
  return <span style={{background:color+'25',color,border:`1px solid ${color}44`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>{children}</span>
}

function SCard({label,value,color,sub,icon,t}) {
  return (
    <div style={{background:t.card,borderRadius:14,padding:'16px 18px',boxShadow:t.glow,border:`1px solid ${t.border}`}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
        <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.09em'}}>{label}</span>
        {icon&&<span style={{fontSize:16}}>{icon}</span>}
      </div>
      <p style={{color:color||t.text,fontSize:20,fontWeight:800,fontFamily:'JetBrains Mono,monospace',lineHeight:1}}>{value}</p>
      {sub&&<p style={{color:t.muted,fontSize:11,marginTop:6}}>{sub}</p>}
    </div>
  )
}

function PZChart({symbol, t, h=420, accessToken, market='india'}) {
  const isCrypto = market === 'crypto' || ['BTC','ETH','SOL','XRP'].includes(symbol)

  const INTERVALS = isCrypto ? [
    {v:'1m',  l:'1m',  res:'1m',  limit:120, refresh:5},
    {v:'5m',  l:'5m',  res:'5m',  limit:200, refresh:10},
    {v:'15m', l:'15m', res:'15m', limit:200, refresh:15},
    {v:'30m', l:'30m', res:'30m', limit:200, refresh:30},
    {v:'1h',  l:'1h',  res:'1h',  limit:200, refresh:60},
    {v:'4h',  l:'4h',  res:'4h',  limit:200, refresh:120},
    {v:'1d',  l:'1D',  res:'1d',  limit:365, refresh:300},
  ] : [
    {v:'minute',  l:'1m',  days:1,   refresh:5},
    {v:'5minute', l:'5m',  days:3,   refresh:10},
    {v:'15minute',l:'15m', days:10,  refresh:15},
    {v:'30minute',l:'30m', days:20,  refresh:30},
    {v:'60minute',l:'1h',  days:60,  refresh:60},
    {v:'day',     l:'1D',  days:365, refresh:300},
    {v:'week',    l:'1W',  days:730, refresh:600},
  ]

  const [intv,    setIntv]    = useState(isCrypto ? '15m' : '15minute')
  const [status,  setStatus]  = useState('idle') // idle | loading | ready | error
  const [errMsg,  setErrMsg]  = useState('')
  const [last,    setLast]    = useState(null)
  const [source,  setSource]  = useState('')
  const [secAgo,  setSecAgo]  = useState(null)
  const [live,    setLive]    = useState(true)

  const chartRef  = useRef(null)
  const lwChart   = useRef(null)
  const candleSer = useRef(null)
  const volSer    = useRef(null)
  const timerRef  = useRef(null)
  const lastFetch = useRef(0)
  const canvasData= useRef([])  // keep last data for theme re-renders

  const cfg = INTERVALS.find(i => i.v === intv) || INTERVALS[2]
  const curr = isCrypto ? '$' : '₹'
  const isDark = () => t.bg === '#07090f' || t.bg === '#080c14' || t.bg === '#0a0e1a'

  // ── Load LWC library (once) ──────────────────────────────────
  function loadLWC() {
    return new Promise((resolve) => {
      if (window.LightweightCharts) { resolve(); return }
      const existing = document.getElementById('lwc-script')
      if (existing) {
        existing.addEventListener('load', resolve)
        return
      }
      const s = document.createElement('script')
      s.id  = 'lwc-script'
      s.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
      s.onload  = resolve
      s.onerror = resolve  // resolve anyway, renderChart will handle missing LWC
      document.head.appendChild(s)
    })
  }

  // ── Fetch candles from API ───────────────────────────────────
  async function fetchCandles() {
    const url = isCrypto
      ? `/api/delta?action=candles&symbol=${symbol}USD&resolution=${cfg.res}&limit=${cfg.limit}`
      : `/api/kite-chart?symbol=${symbol}&interval=${cfg.v}&days=${cfg.days}`
    const headers = (!isCrypto && accessToken) ? { 'x-kite-access-token': accessToken } : {}
    const r = await fetch(url, { headers })
    const d = await r.json()
    if (!d.candles?.length) throw new Error('No candle data returned')
    // Sort oldest→newest, remove duplicates, filter bad candles
    const clean = [...d.candles]
      .sort((a, b) => a.time - b.time)
      .filter((c, i, arr) => i === 0 || c.time !== arr[i-1].time)
      .filter(c => c.open > 0 && c.close > 0 && c.high >= c.low)
    setSource(d.source || (isCrypto ? 'delta' : 'kite'))
    setLast(clean[clean.length - 1])
    lastFetch.current = Date.now()
    canvasData.current = clean
    return clean
  }

  // ── Build chart ──────────────────────────────────────────────
  function buildChart(candles) {
    if (!chartRef.current) return
    if (!window.LightweightCharts) { setErrMsg('Chart library failed to load. Refresh page.'); setStatus('error'); return }

    // Destroy previous
    if (lwChart.current) { try { lwChart.current.remove() } catch {} lwChart.current = null }
    chartRef.current.innerHTML = ''

    const dark = isDark()
    const bgColor = dark ? '#0d1117' : '#ffffff'
    const chartH  = h - 110

    const chart = window.LightweightCharts.createChart(chartRef.current, {
      width:  chartRef.current.clientWidth || 360,
      height: chartH,
      layout: {
        background: { type: 'solid', color: bgColor },
        textColor:  dark ? '#9ca3af' : '#6b7280',
        fontSize:   11,
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: dark ? '#1f293718' : '#f1f5f918' },
        horzLines: { color: dark ? '#1f293718' : '#f1f5f918' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: dark ? '#1f2937' : '#e5e7eb',
        scaleMargins: { top: 0.05, bottom: 0.25 },
      },
      timeScale: {
        borderColor:    dark ? '#1f2937' : '#e5e7eb',
        timeVisible:    true,
        secondsVisible: cfg.v === 'minute' || cfg.v === '1m',
      },
      handleScroll: true,
      handleScale:  true,
    })

    // Candlestick series
    const cSer = chart.addCandlestickSeries({
      upColor:         '#10f59e',
      downColor:       '#ff4466',
      borderUpColor:   '#10f59e',
      borderDownColor: '#ff4466',
      wickUpColor:     '#10f59e99',
      wickDownColor:   '#ff446699',
    })
    cSer.setData(candles)

    // Volume series
    const vSer = chart.addHistogramSeries({
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    vSer.setData(candles.map(c => ({
      time:  c.time,
      value: c.volume || 0,
      color: c.close >= c.open ? '#10f59e25' : '#ff446625',
    })))

    chart.timeScale().fitContent()

    lwChart.current   = chart
    candleSer.current = cSer
    volSer.current    = vSer

    // Responsive
    const ro = new ResizeObserver(() => {
      if (chartRef.current && lwChart.current) {
        lwChart.current.applyOptions({ width: chartRef.current.clientWidth })
      }
    })
    ro.observe(chartRef.current)
  }

  // ── Full load (fetch + build) ────────────────────────────────
  async function loadFull() {
    setStatus('loading')
    setErrMsg('')
    try {
      await loadLWC()          // ensure library is ready FIRST
      const candles = await fetchCandles()
      buildChart(candles)      // now safe to build
      setStatus('ready')
    } catch(e) {
      console.error('[PZChart]', e.message)
      setErrMsg(e.message || 'Failed to load chart')
      setStatus('error')
    }
  }

  // ── Silent update (last 2 candles only) ──────────────────────
  async function silentUpdate() {
    if (status !== 'ready' || !candleSer.current) return
    try {
      const candles = await fetchCandles()
      candles.slice(-2).forEach(c => {
        try { candleSer.current.update(c) } catch {}
        try {
          volSer.current?.update({
            time: c.time, value: c.volume || 0,
            color: c.close >= c.open ? '#10f59e25' : '#ff446625',
          })
        } catch {}
      })
      setSecAgo(0)
    } catch {}
  }

  // ── Main effect: reload on symbol/interval/token change ──────
  useEffect(() => {
    loadFull()
    if (timerRef.current) clearInterval(timerRef.current)
    if (live) {
      timerRef.current = setInterval(() => {
        silentUpdate()
        if (lastFetch.current) setSecAgo(Math.round((Date.now() - lastFetch.current) / 1000))
      }, cfg.refresh * 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [symbol, intv, accessToken, live])

  // ── Theme change: rebuild chart with same data ────────────────
  useEffect(() => {
    if (status === 'ready' && canvasData.current.length) {
      buildChart(canvasData.current)
    }
  }, [t])

  // ── Render ───────────────────────────────────────────────────
  const chg  = last ? parseFloat(((last.close - last.open) / last.open * 100).toFixed(2)) : 0
  const isUp = chg >= 0

  return (
    <div style={{borderRadius:16,overflow:'hidden',border:`1px solid ${t.border}`,background:t.card}}>

      {/* Header */}
      <div style={{padding:'10px 14px',display:'flex',justifyContent:'space-between',
        alignItems:'center',borderBottom:`1px solid ${t.border}`,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{width:7,height:7,borderRadius:'50%',display:'inline-block',
            background: status==='ready' ? (live ? t.green : t.amber) : t.muted,
            animation: status==='ready' && live ? 'pulse 1.5s infinite' : 'none'}} />
          <span style={{fontWeight:800,fontSize:15,color:t.text}}>{symbol}</span>
          {last && (
            <>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:14,fontWeight:700,color:t.text}}>
                {curr}{parseFloat(last.close).toLocaleString('en-IN',
                  {maximumFractionDigits: isCrypto && last.close > 100 ? 0 : 2})}
              </span>
              <span style={{fontSize:11,fontWeight:700,padding:'2px 7px',borderRadius:5,
                color: isUp ? t.green : t.red,
                background: (isUp ? t.green : t.red) + '18'}}>
                {isUp?'+':''}{chg}%
              </span>
            </>
          )}
          <span style={{color:t.muted,fontSize:10}}>
            {isCrypto ? '🟢 Delta' : source==='kite' ? '🟢 Kite' : '⚪ Yahoo'}
            {secAgo !== null && secAgo > 0 ? ` · ${secAgo}s` : ''}
          </span>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={() => setLive(v => !v)}
            style={{padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',
              fontFamily:'Inter,sans-serif',
              background: live ? t.green+'22' : t.surface,
              border: `1px solid ${live ? t.green : t.border}`,
              color: live ? t.green : t.muted}}>
            {live ? `⚡ ${cfg.refresh}s` : '⏸'}
          </button>
          <button onClick={loadFull}
            style={{padding:'3px 8px',borderRadius:6,fontSize:13,cursor:'pointer',
              background:'none',border:`1px solid ${t.border}`,color:t.muted}}>↻</button>
        </div>
      </div>

      {/* Interval buttons */}
      <div style={{padding:'6px 14px',display:'flex',gap:4,flexWrap:'wrap',
        borderBottom:`1px solid ${t.border}`,background:t.surface+'55'}}>
        {INTERVALS.map(i => (
          <button key={i.v} onClick={() => setIntv(i.v)}
            style={{padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:700,
              cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all 0.1s',
              background: intv===i.v ? t.accentC : t.surface,
              border: `1px solid ${intv===i.v ? t.accentC : t.border}`,
              color: intv===i.v ? '#fff' : t.muted}}>
            {i.l}
          </button>
        ))}
      </div>

      {/* Chart / Loading / Error */}
      <div style={{position:'relative',width:'100%',height: h - 110}}>
        {status === 'loading' && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
            justifyContent:'center',flexDirection:'column',gap:12,zIndex:2,
            background: isDark() ? '#0d1117' : '#ffffff'}}>
            <div style={{width:32,height:32,border:`3px solid ${t.border}`,
              borderTopColor:t.accentC,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            <p style={{color:t.muted,fontSize:12}}>Loading {cfg.l} candles...</p>
          </div>
        )}
        {status === 'error' && (
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
            justifyContent:'center',flexDirection:'column',gap:10,
            background: isDark() ? '#0d1117' : '#ffffff'}}>
            <p style={{color:t.red,fontSize:13,textAlign:'center',padding:'0 20px'}}>{errMsg}</p>
            <button onClick={loadFull}
              style={{padding:'6px 16px',background:t.surface,border:`1px solid ${t.border}`,
                borderRadius:8,color:t.muted,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              Try Again
            </button>
          </div>
        )}
        <div ref={chartRef} style={{width:'100%',height:'100%',touchAction:'none'}} />
      </div>
    </div>
  )
}

function KiteTradesPanel({at, t}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => { if (at) load() }, [at])

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/kite-trades', {
        headers: { 'x-kite-access-token': at }
      })
      const d = await r.json()
      if (d.status === 'success') setData(d)
      else setError(d.error || 'Failed to load')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  if (!at) return null  // only show when Zerodha connected

  const fmt = (n) => `₹${Math.abs(n).toLocaleString('en-IN', {maximumFractionDigits:2})}`
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}) : '—'

  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <p style={{fontWeight:800,fontSize:15,color:t.text}}>📋 Today's Zerodha Activity</p>
        <button onClick={load} style={{background:'none',border:`1px solid ${t.border}`,borderRadius:8,
          color:t.muted,cursor:'pointer',fontSize:12,padding:'4px 10px'}}>
          {loading ? '⏳' : '↻ Refresh'}
        </button>
      </div>

      {error && <p style={{color:t.red,fontSize:12,marginBottom:8}}>{error}</p>}

      {data && (
        <>
          {/* P&L Summary */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:16}}>
            {[
              {l:'TRADES TODAY',    v:data.summary.tradesCount,                    c:t.text},
              {l:'REALISED P&L',    v:(data.summary.realisedPnL>=0?'+':'')+fmt(data.summary.realisedPnL),  c:data.summary.realisedPnL>=0?t.green:t.red},
              {l:'UNREALISED P&L',  v:(data.summary.unrealisedPnL>=0?'+':'')+fmt(data.summary.unrealisedPnL), c:data.summary.unrealisedPnL>=0?t.green:t.red},
              {l:'TOTAL P&L',       v:(data.summary.totalPnL>=0?'+':'')+fmt(data.summary.totalPnL),        c:data.summary.totalPnL>=0?t.green:t.red},
            ].map(x=>(
              <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.06em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:15,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          {/* Today's trades table */}
          {data.trades.length > 0 ? (
            <div style={{background:t.card,borderRadius:12,border:`1px solid ${t.border}`,overflow:'hidden',marginBottom:12}}>
              <div style={{padding:'8px 14px',background:t.surface,borderBottom:`1px solid ${t.border}`,fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>
                EXECUTED TRADES TODAY ({data.trades.length})
              </div>
              <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}><table style={{width:'100%',minWidth:500,borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:t.surface+'88'}}>
                    {['TIME','SYMBOL','DIRECTION','QTY','PRICE','VALUE'].map(h=>(
                      <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:t.muted,borderBottom:`1px solid ${t.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((tr,i)=>(
                    <tr key={tr.id} style={{borderBottom:`1px solid ${t.border}22`}}>
                      <td style={{padding:'8px 12px',color:t.muted,fontSize:11}}>{fmtTime(tr.filledAt)}</td>
                      <td style={{padding:'8px 12px',fontWeight:700,color:t.text,fontSize:12}}>{tr.symbol}</td>
                      <td style={{padding:'8px 12px'}}>
                        <span style={{color:tr.direction==='BUY'?t.green:t.red,fontWeight:700,fontSize:11}}>
                          {tr.direction==='BUY'?'▲ BUY':'▼ SELL'}
                        </span>
                      </td>
                      <td style={{padding:'8px 12px',color:t.text2,fontSize:12}}>{tr.quantity}</td>
                      <td style={{padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>₹{tr.price?.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                      <td style={{padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text2}}>₹{tr.value?.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ) : (
            <div style={{background:t.card,borderRadius:12,padding:'20px',border:`1px solid ${t.border}`,textAlign:'center',marginBottom:12}}>
              <p style={{color:t.muted,fontSize:13}}>No trades executed today on Zerodha</p>
            </div>
          )}

          {/* Open orders */}
          {data.orders.filter(o=>o.status==='OPEN').length > 0 && (
            <div style={{background:t.amber+'0a',borderRadius:12,border:`1px solid ${t.amber}33`,padding:'12px 14px'}}>
              <p style={{color:t.amber,fontSize:12,fontWeight:700,marginBottom:8}}>⏳ PENDING ORDERS ({data.orders.filter(o=>o.status==='OPEN').length})</p>
              {data.orders.filter(o=>o.status==='OPEN').map(o=>(
                <p key={o.id} style={{color:t.text2,fontSize:12,marginBottom:4}}>
                  {o.direction} {o.quantity} {o.symbol} @ ₹{o.price} — {o.orderType}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {loading && !data && (
        <div style={{textAlign:'center',padding:20}}>
          <div style={{width:20,height:20,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
          <p style={{color:t.muted,fontSize:12}}>Loading Zerodha trade history...</p>
        </div>
      )}
    </div>
  )
}


function Positions({at,t}) {
  const [pos,setPos]=useState([]),[funds,setFunds]=useState(null),[orders,setOrders]=useState([]),[loading,setLoading]=useState(false)
  useEffect(()=>{if(at)load()},[at])
  async function load(){setLoading(true);try{const H={'x-kite-access-token':at};const [pr,fr,or]=await Promise.all([fetch('/api/kite-pro?action=positions',{headers:H}).then(r=>r.json()),fetch('/api/kite-pro?action=funds',{headers:H}).then(r=>r.json()),fetch('/api/kite-pro?action=orders',{headers:H}).then(r=>r.json())]);setPos([...(pr.data?.net||[]),...(pr.data?.day||[])].filter(p=>p.quantity!==0));setFunds(fr.data);setOrders((or.data||[]).slice(0,15))}catch{}setLoading(false)}
  if (!at) return <div style={{textAlign:'center',padding:60}}><p style={{fontSize:50,marginBottom:12}}>🔐</p><p style={{color:t.text,fontWeight:700,fontSize:16,marginBottom:6}}>Login with Zerodha</p><p style={{color:t.muted,fontSize:13}}>Connect to see your live portfolio</p></div>
  if (loading) return <div style={{textAlign:'center',padding:40}}><div style={{width:36,height:36,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}} /></div>
  const eq=funds?.equity,avail=eq?.available?.live_balance||eq?.net||0,used=eq?.utilised?.debits||0,pnl=pos.reduce((a,p)=>a+(p.pnl||p.unrealised||0),0)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {funds&&<div><p style={{color:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:12}}>ACCOUNT FUNDS</p><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}><SCard label="AVAILABLE" value={`₹${fmt(avail)}`} color={t.blue} icon="💰" t={t}/><SCard label="USED" value={`₹${fmt(used)}`} color={t.amber} icon="📊" t={t}/><SCard label="LIVE P&L" value={`${pnl>=0?'+':''}₹${fmt(pnl)}`} color={clr(pnl,t)} icon="📈" t={t}/></div></div>}
      <div>
        <p style={{color:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.1em',marginBottom:12}}>OPEN POSITIONS ({pos.length})</p>
        {pos.length===0?<div style={{background:t.surface,borderRadius:14,padding:24,textAlign:'center',color:t.muted,border:`1px solid ${t.border}`,fontSize:13}}>No open positions</div>
        :<div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Symbol','Qty','Avg','LTP','P&L','Chart'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{pos.map((p,i)=>{const pl=p.pnl||p.unrealised||0;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{p.tradingsymbol}</td><td style={{padding:'12px 16px',color:(p.quantity||0)>0?t.green:t.red,fontWeight:700}}>{(p.quantity||0)>0?'+':''}{p.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>₹{fmt(p.average_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(p.last_price)}</td><td style={{padding:'12px 16px',color:clr(pl,t),fontWeight:800,fontFamily:'monospace'}}>{pl>=0?'+':''}₹{fmt(pl)}</td><td style={{padding:'12px 16px'}}><button onClick={()=>window.open(KITE_SEARCH[p.tradingsymbol]||`https://kite.zerodha.com/chart/web/ciq/NSE/${p.tradingsymbol}/EQ`,'_blank')} style={{padding:'4px 10px',background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:6,color:t.blue,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif',fontWeight:600}}>↗</button></td></tr>})}</tbody></table></div>}
      </div>
      {orders.length>0&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><p style={{color:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.1em'}}>TODAY'S ORDERS ({orders.length})</p><button onClick={load} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:11,padding:'4px 10px',fontFamily:'Inter,sans-serif'}}>🔄</button></div><div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Time','Symbol','Type','Qty','Price','Status'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{orders.map((o,i)=>{const time=o.order_timestamp?new Date(o.order_timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}):'—';const sc2=o.status==='COMPLETE'?t.green:o.status==='REJECTED'?t.red:o.status==='OPEN'?t.amber:t.muted;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',color:t.muted}}>{time}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{o.tradingsymbol}</td><td style={{padding:'12px 16px'}}><span style={{color:o.transaction_type==='BUY'?t.green:t.red,fontWeight:700}}>{o.transaction_type}</span></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{o.filled_quantity}/{o.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(o.average_price||o.price)}</td><td style={{padding:'12px 16px'}}><Badge color={sc2}>{o.status}</Badge></td></tr>})}</tbody></table></div></div>}
    </div>
  )
}

function Charts({t, at}) {
  const [sel,setSel]=useState('NIFTY')
  const syms=Object.keys(KITE_SEARCH)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Live Charts</h2><p style={{color:t.muted,fontSize:13,marginTop:4}}>Click any symbol to view chart · All 9 timeframes · Open in Kite for full view</p></div>
        <button onClick={()=>window.open(`/chart?symbol=${sel}`,'_blank','width=1400,height=800,menubar=no,toolbar=no')} style={{padding:'8px 18px',background:t.accent,border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Inter,sans-serif'}} onClick={()=>window.open(`/chart?symbol=${sel}`,'_blank','width=1400,height=800')}>⛶ Full Screen</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {syms.map(s=><button key={s} onClick={()=>setSel(s)} style={{padding:'7px 16px',borderRadius:20,fontSize:13,fontWeight:700,background:sel===s?t.accentC:t.surface,border:`1.5px solid ${sel===s?t.accentC:t.border}`,color:sel===s?'#fff':t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all 0.15s'}}>{s}</button>)}
      </div>
      <PZChart symbol={sel} t={t} h={520} accessToken={at} key={sel} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginTop:14}}>
        {syms.filter(s=>s!==sel).map(s=><button key={s} onClick={()=>setSel(s)} style={{padding:'10px',background:t.card,border:`1px solid ${t.border}`,borderRadius:12,cursor:'pointer',fontFamily:'Inter,sans-serif',textAlign:'left',transition:'all 0.15s'}}><span style={{color:t.muted,fontSize:10,fontWeight:700,display:'block',marginBottom:3}}>CHART</span><span style={{color:t.text,fontSize:13,fontWeight:800}}>{s}</span></button>)}
      </div>
    </div>
  )
}

// ── Manual Trade Form ──────────────────────────────────────────
function ManualTradeForm({t, onSave, onClose, manForm, setManForm}) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    if (!manForm.entry_price) { setError('Entry price is required'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/trades', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          symbol:      manForm.symbol.toUpperCase(),
          direction:   manForm.direction,
          quantity:    parseInt(manForm.quantity) || 1,
          entry_price: parseFloat(manForm.entry_price),
          stop_loss:   manForm.stop_loss ? parseFloat(manForm.stop_loss) : null,
          target:      manForm.target    ? parseFloat(manForm.target)    : null,
          strategy:    manForm.strategy  || 'Manual',
          notes:       manForm.notes     || '',
          market:      manForm.market,
          status:      'OPEN',
        })
      })
      const d = await r.json()
      if (d.trade || d.id) { onSave() }
      else setError(d.error || 'Failed to save')
    } catch(e) { setError(e.message) }
    setSaving(false)
  }

  const inp = (field, label, placeholder, type='text') => (
    <div>
      <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:4,letterSpacing:'0.06em'}}>{label}</p>
      <input
        type={type} value={manForm[field]} placeholder={placeholder}
        onChange={e=>setManForm(f=>({...f,[field]:e.target.value}))}
        style={{width:'100%',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,
          color:t.text,padding:'8px 10px',fontSize:13,fontFamily:'JetBrains Mono,monospace',boxSizing:'border-box'}}
      />
    </div>
  )

  return (
    <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid #ff660044`,marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <p style={{fontWeight:800,fontSize:15,color:t.text}}>📝 Log Manual Trade</p>
        <button onClick={onClose} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:18}}>✕</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:12}}>
        <div>
          <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:4,letterSpacing:'0.06em'}}>MARKET</p>
          <select value={manForm.market} onChange={e=>setManForm(f=>({...f,market:e.target.value}))}
            style={{width:'100%',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',fontSize:13,fontFamily:'Inter,sans-serif'}}>
            <option value="india">🇮🇳 India (Zerodha)</option>
            <option value="crypto">🪙 Crypto (Binance)</option>
            <option value="delta">⚡ Delta Futures</option>
          </select>
        </div>
        <div>
          <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:4,letterSpacing:'0.06em'}}>DIRECTION</p>
          <select value={manForm.direction} onChange={e=>setManForm(f=>({...f,direction:e.target.value}))}
            style={{width:'100%',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',fontSize:13,fontFamily:'Inter,sans-serif'}}>
            <option value="BUY">▲ BUY / LONG</option>
            <option value="SELL">▼ SELL / SHORT</option>
          </select>
        </div>
        {inp('symbol',    'SYMBOL',     'NIFTY / BTC')}
        {inp('quantity',  'QTY',        '50', 'number')}
        {inp('entry_price','ENTRY ₹/$', '24500', 'number')}
        {inp('stop_loss', 'STOP LOSS',  '24300', 'number')}
        {inp('target',    'TARGET',     '24800', 'number')}
        {inp('strategy',  'STRATEGY',   'VWAP')}
      </div>

      <div style={{marginBottom:12}}>
        <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:4,letterSpacing:'0.06em'}}>NOTES (optional)</p>
        <input value={manForm.notes} placeholder="Why did you take this trade?"
          onChange={e=>setManForm(f=>({...f,notes:e.target.value}))}
          style={{width:'100%',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,
            color:t.text,padding:'8px 10px',fontSize:13,fontFamily:'Inter,sans-serif',boxSizing:'border-box'}}/>
      </div>

      {error && <p style={{color:t.red,fontSize:12,marginBottom:8}}>{error}</p>}

      <button onClick={save} disabled={saving}
        style={{padding:'10px 24px',background:saving?t.surface:'linear-gradient(135deg,#ff6600,#ff9500)',
          border:'none',borderRadius:10,color:saving?t.muted:'#fff',fontWeight:700,
          cursor:saving?'not-allowed':'pointer',fontFamily:'Inter,sans-serif',fontSize:14}}>
        {saving?'Saving...':'✅ Save Trade'}
      </button>
    </div>
  )
}


function History({refresh,t}) {
  const [trades,setTrades]=useState([]),[loading,setLoading]=useState(false)
  useEffect(()=>{load()},[refresh])
  async function load(){setLoading(true);try{const r=await fetch('/api/trades?limit=50');const d=await r.json();setTrades(d.trades||[])}catch{}setLoading(false)}
  async function close(id,entry,dir,sym,strat){
    const ep=prompt(`Close Trade\nDirection: ${dir}\nEntry Price: ₹${entry}\n\nEnter exit price:`)
    if(!ep||isNaN(parseFloat(ep)))return
    const r=await fetch('/api/trades',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})})
    const d=await r.json()
    const pnl=d.pnl||d.trade?.pnl
    if(pnl!==undefined){
      alert(`Trade Closed!\nP&L: ₹${Number(pnl).toFixed(2)}\n${pnl>0?'🟢 Profit!':'🔴 Loss'}`)
      // Auto post-trade AI analysis — saves to DB, runs once per trade, never re-runs
      fetch('/api/ai-analysis',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'post_trade',data:{tradeId:id,symbol:sym||'Unknown',direction:dir,entryPrice:entry,exitPrice:parseFloat(ep),pnl:Number(pnl),strategy:strat||'Unknown'}})
      }).catch(()=>{})
    }
    load()
  }
  const closed=trades.filter(x=>x.status==='CLOSED'),openT=trades.filter(x=>x.status==='OPEN'),totalPnL=closed.reduce((a,x)=>a+(x.pnl||0),0),wr=closed.length>0?`${(closed.filter(x=>(x.pnl||0)>0).length/closed.length*100).toFixed(0)}%`:'—'
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12}}>
        <SCard label="TOTAL" value={trades.length} icon="📋" t={t}/>
        <SCard label="OPEN" value={openT.length} color={t.amber} icon="🔓" t={t}/>
        <SCard label="WIN RATE" value={wr} color={parseInt(wr)>50?t.green:t.red} icon="🎯" t={t}/>
        <SCard label="TOTAL P&L" value={`₹${fmt(totalPnL)}`} color={clr(totalPnL,t)} icon="💹" t={t}/>
      </div>
      {loading&&<div style={{textAlign:'center',padding:30}}><div style={{width:32,height:32,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}} /></div>}
      {!loading&&trades.length===0&&<div style={{textAlign:'center',padding:50,background:t.surface,borderRadius:16,border:`1px solid ${t.border}`}}><p style={{fontSize:40,marginBottom:10}}>📋</p><p style={{color:t.text,fontWeight:700}}>No trades yet</p><p style={{color:t.muted,fontSize:13,marginTop:4}}>No trades yet. Use '+ Log Trade' to record your trades, or execute a signal from the Signals tab.</p></div>}
      {!loading&&trades.length>0&&<div style={{overflowX:'auto',borderRadius:16,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Date','Symbol','Strategy','Dir','Qty','Entry','Exit','P&L','Status',''].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead><tbody>{trades.map((x,i)=>{const pc=clr(x.pnl||0,t),date=new Date(x.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});return <tr key={x.id} style={{borderBottom:`1px solid ${t.border}22`,background:i%2?t.surface+'44':'transparent'}}><td style={{padding:'12px 16px',color:t.muted,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{x.symbol}</td><td style={{padding:'12px 16px',color:t.muted,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.strategy}</td><td style={{padding:'12px 16px'}}><Badge color={x.direction==='BUY'?t.green:t.red}>{x.direction}</Badge></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(x.entry_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.exit_price?`₹${fmt(x.exit_price)}`:'—'}</td><td style={{padding:'12px 16px',color:pc,fontWeight:800,fontFamily:'monospace'}}>{x.pnl!=null?`${x.pnl>=0?'+':''}₹${fmt(x.pnl)}`:'—'}</td><td style={{padding:'12px 16px'}}><Badge color={x.status==='OPEN'?t.amber:x.status==='CLOSED'?t.green:t.red}>{x.status}</Badge></td><td style={{padding:'12px 16px'}}>{x.status==='OPEN'&&<button onClick={()=>close(x.id,x.entry_price,x.direction,x.symbol,x.strategy)} style={{padding:'5px 12px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif',fontWeight:600}}>Close</button>}</td></tr>})}</tbody></table></div>}
    </div>
  )
}


// ── Market Status Banner ───────────────────────────────────────
function MarketStatusBanner({t}) {
  const [mounted, setMounted] = useState(false)
  const [time,    setTime]    = useState(null)

  useEffect(() => {
    setMounted(true)
    setTime(new Date())
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  if (!mounted || !time) return <div style={{height:44,marginBottom:16}}/>

  const ist = new Date(time.toLocaleString('en-US', {timeZone:'Asia/Kolkata'}))
  const h   = ist.getHours()
  const m   = ist.getMinutes()
  const s   = ist.getSeconds()
  const day = ist.getDay()
  const mins = h*60+m

  const isWeekday   = day >= 1 && day <= 5
  const isPreOpen   = isWeekday && mins >= 540  && mins < 555   // 9:00-9:15
  const isOpen      = isWeekday && mins >= 555  && mins <= 930  // 9:15-3:30
  const isClosing   = isWeekday && mins >= 919  && mins <= 930  // 3:19-3:30
  const isPost      = isWeekday && mins > 930   && mins < 1080  // after 3:30
  const isWeekend   = day === 0 || day === 6

  // Time to next event
  let nextLabel = '', nextMins = 0, statusColor = '', statusText = '', statusEmoji = ''

  if (isOpen && !isClosing) {
    const closeAt = 930
    nextMins  = closeAt - mins
    nextLabel = `Market closes in ${Math.floor(nextMins/60)}h ${nextMins%60}m`
    statusColor = t.green; statusText = 'MARKET OPEN'; statusEmoji = '🟢'
  } else if (isClosing) {
    nextMins  = 930 - mins
    nextLabel = `⚠️ MIS AUTO-CLOSE IN ${nextMins}m ${60-s}s`
    statusColor = t.red; statusText = 'CLOSING SOON'; statusEmoji = '🔴'
  } else if (isPreOpen) {
    nextMins  = 555 - mins
    nextLabel = `Market opens in ${nextMins}m ${60-s}s`
    statusColor = t.amber; statusText = 'PRE-OPEN'; statusEmoji = '🟡'
  } else if (isPost) {
    const tomorrow = isWeekday && day < 5 ? 'tomorrow' : 'Monday'
    nextLabel = `Next session: ${tomorrow} 9:15 AM IST`
    statusColor = t.muted; statusText = 'MARKET CLOSED'; statusEmoji = '⚫'
  } else if (isWeekend) {
    nextLabel = 'Market reopens Monday 9:15 AM IST'
    statusColor = t.muted; statusText = 'WEEKEND'; statusEmoji = '⚫'
  } else {
    const openAt = isWeekday ? 555 - mins : 0
    nextLabel = `Market opens in ${Math.floor(openAt/60)}h ${openAt%60}m`
    statusColor = t.muted; statusText = 'CLOSED'; statusEmoji = '⚫'
  }

  const timeStr = ist.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})

  return (
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      background:isOpen?(isClosing?t.red+'0a':t.green+'08'):t.surface,
      border:`1px solid ${isOpen?(isClosing?t.red:t.green):t.border}33`,
      borderRadius:12,padding:'10px 16px',marginBottom:16,flexWrap:'wrap',gap:8,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:statusColor,
          boxShadow:isOpen?`0 0 8px ${statusColor}`:'none',
          animation:isOpen?'pulse 1.5s infinite':'none',flexShrink:0}}/>
        <span style={{fontWeight:700,fontSize:13,color:statusColor}}>{statusText}</span>
        <span style={{color:t.muted,fontSize:12}}>NSE/BSE</span>
        {isOpen&&<span style={{background:t.green+'18',color:t.green,fontSize:10,fontWeight:600,padding:'1px 8px',borderRadius:20,border:`1px solid ${t.green}33`}}>LIVE</span>}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <span style={{color:t.muted,fontSize:12}}>{nextLabel}</span>
        <span style={{color:t.text,fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:600}}>{timeStr}</span>
      </div>
    </div>
  )
}


// ── Watchlist Tab ──────────────────────────────────────────────
function WatchlistTab({t, at}) {
  const [items,   setItems]   = useState([])
  const [prices,  setPrices]  = useState({})
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({symbol:'NIFTY',market:'india',note:''})
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  useEffect(() => { load() }, [])
  useEffect(() => { 
    if(items.length) {
      fetchPrices()
      // Auto-refresh prices every 30 seconds
      const iv = setInterval(fetchPrices, 30000)
      return () => clearInterval(iv)
    }
  }, [items])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/watchlist')
      const d = await r.json()
      setItems(d.items || [])
    } catch {}
    setLoading(false)
  }

  async function fetchPrices() {
    try {
      const indSyms = items.filter(i=>i.market==='india').map(i=>i.symbol)
      const cryptoSyms = items.filter(i=>i.market==='crypto').map(i=>i.symbol)
      const newPrices = {}

      if (indSyms.length) {
        const r = await fetch(`/api/market?symbols=${indSyms.join(',')}`)
        const d = await r.json()
        if (d.data) Object.assign(newPrices, d.data)
      }
      if (cryptoSyms.length) {
        const r = await fetch('/api/binance?action=prices')
        const d = await r.json()
        if (d.prices) Object.assign(newPrices, d.prices)
      }
      setPrices(newPrices)
    } catch {}
  }

  async function add() {
    if (!form.symbol) return
    setSaving(true)
    const r = await fetch('/api/watchlist', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(form)
    })
    const d = await r.json()
    if (d.item) { setMsg('Added!'); load(); setForm(f=>({...f,note:''})) }
    else setMsg('Error: ' + d.error)
    setSaving(false)
    setTimeout(() => setMsg(''), 2000)
  }

  async function remove(id) {
    await fetch('/api/watchlist', {
      method: 'DELETE', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({id})
    })
    load()
  }

  const INDIA_SYMS  = ['NIFTY','BANKNIFTY','SENSEX','TCS','INFY','RELIANCE','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','LT','BAJFINANCE']
  const CRYPTO_SYMS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA']
  const syms = form.market === 'crypto' ? CRYPTO_SYMS : INDIA_SYMS
  const curr = (mkt) => mkt === 'crypto' ? '$' : '₹'

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Watchlist</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:5}}>Track symbols with live prices and personal notes</p>
      </div>

      {/* Add form */}
      <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid ${t.border}`,marginBottom:20}}>
        <p style={{color:t.text,fontWeight:700,fontSize:14,marginBottom:14}}>+ Add Symbol</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:14}}>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>MARKET</p>
            <select value={form.market} onChange={e=>setForm(f=>({...f,market:e.target.value,symbol:e.target.value==='crypto'?'BTC':'NIFTY'}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Inter,sans-serif'}}>
              <option value="india">🇮🇳 Indian</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>SYMBOL</p>
            <select value={form.symbol} onChange={e=>setForm(f=>({...f,symbol:e.target.value}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Inter,sans-serif'}}>
              {syms.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{gridColumn:'span 2'}}>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>NOTE (optional)</p>
            <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              placeholder="e.g. watching for breakout above 24500, earnings next week..."
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Inter,sans-serif',boxSizing:'border-box'}}/>
          </div>
        </div>
        {msg&&<p style={{color:msg.includes('Error')?t.red:t.green,fontSize:13,marginBottom:8,fontWeight:600}}>{msg}</p>}
        <button onClick={add} disabled={saving}
          style={{padding:'10px 24px',background:'linear-gradient(135deg,#ff6600,#ff9500)',border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:13,boxShadow:'0 4px 16px #ff660033'}}>
          {saving?'Adding...':'Add to Watchlist'}
        </button>
      </div>

      {/* Watchlist */}
      {loading ? (
        <div style={{textAlign:'center',padding:40}}>
          <div style={{width:28,height:28,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
        </div>
      ) : items.length === 0 ? (
        <div style={{background:t.card,borderRadius:16,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{fontSize:36,marginBottom:12}}>👁</p>
          <p style={{color:t.text,fontWeight:700,fontSize:16,marginBottom:6}}>Watchlist is empty</p>
          <p style={{color:t.muted,fontSize:13}}>Add symbols above to track live prices with your notes</p>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
          {items.map(item => {
            const p = prices[item.symbol]
            const pct = p?.pct || 0
            const price = p?.price
            return (
              <div key={item.id} style={{background:t.card,borderRadius:14,padding:18,border:`1px solid ${t.border}`,position:'relative'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                      <span style={{fontWeight:800,fontSize:17,color:t.text}}>{item.symbol}</span>
                      <span style={{background:item.market==='crypto'?'#ff990022':'#ff660022',color:item.market==='crypto'?t.amber:'#ff6600',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,border:`1px solid ${item.market==='crypto'?t.amber+'44':'#ff660033'}`}}>
                        {item.market==='crypto'?'🪙 Crypto':'🇮🇳 India'}
                      </span>
                    </div>
                    {price ? (
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:16,color:t.text}}>{curr(item.market)}{Number(price).toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
                        <span style={{color:pct>=0?t.green:t.red,fontWeight:700,fontSize:13}}>{pct>=0?'+':''}{pct.toFixed(2)}%</span>
                      </div>
                    ) : (
                      <span style={{color:t.muted,fontSize:13}}>Loading...</span>
                    )}
                  </div>
                  <button onClick={()=>remove(item.id)}
                    style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:18,padding:4,borderRadius:6}}>×</button>
                </div>
                {item.note && (
                  <div style={{background:t.surface,borderRadius:8,padding:'8px 10px',border:`1px solid ${t.border}`}}>
                    <p style={{color:t.text2,fontSize:12,lineHeight:1.5}}>📝 {item.note}</p>
                  </div>
                )}
                <div style={{display:'flex',gap:6,marginTop:10}}>
                  <button onClick={()=>window.open(`/chart?symbol=${item.symbol}&market=${item.market}`,'_blank','width=1440,height=860')}
                    style={{flex:1,padding:'7px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.blue,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'Inter,sans-serif'}}>
                    📈 Chart
                  </button>
                  <button onClick={()=>window.open(`/api/asset-deep-dive?symbol=${item.symbol}&market=${item.market}`,'_blank')}
                    style={{flex:1,padding:'7px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.purple,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'Inter,sans-serif'}}>
                    🔬 Deep Dive
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Binance Portfolio ──────────────────────────────────────────
function BinancePortfolio({t}) {
  const [account,  setAccount]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [prices,   setPrices]   = useState({})
  const [showAll,  setShowAll]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      // Fetch prices first (always works), account separately (may fail due to IP)
      const priceR = await fetch('/api/binance?action=prices')
      const priceD = await priceR.json()
      setPrices(priceD.prices || {})

      // Try account - may fail if IP not whitelisted
      const acctR = await fetch('/api/binance?action=account')
      const acctD = await acctR.json()

      if (acctD.error) {
        // Show helpful message but don't block the whole portfolio
        setError('Binance account: ' + acctD.error + ' — Fix: Binance API → add IPs 76.76.21.21 through 76.76.21.241')
      } else {
        setAccount(acctD)
      }
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{textAlign:'center',padding:40}}>
      <div style={{width:28,height:28,border:`3px solid ${t.border}`,borderTopColor:t.amber,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 10px'}}/>
      <p style={{color:t.muted,fontSize:12}}>Loading Binance account...</p>
    </div>
  )

  if (error) return (
    <div style={{textAlign:'center',padding:32}}>
      <p style={{fontSize:32,marginBottom:8}}>⚠️</p>
      <p style={{color:t.red,fontWeight:600,fontSize:13,marginBottom:6}}>Connection Error</p>
      <p style={{color:t.muted,fontSize:12,marginBottom:14}}>{error}</p>
      <button onClick={load} style={{padding:'7px 18px',background:t.amber+'22',border:`1px solid ${t.amber}44`,borderRadius:8,color:t.amber,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600,fontSize:12}}>↻ Retry</button>
    </div>
  )

  if (!account) return null

  // Compute total portfolio value in USDT
  const balances = (account.balances || []).filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
  
  const withValue = balances.map(b => {
    const free   = parseFloat(b.free)
    const locked = parseFloat(b.locked)
    const total  = free + locked
    let usdtVal  = 0
    if (b.asset === 'USDT') usdtVal = total
    else if (prices[b.asset]?.price) usdtVal = total * prices[b.asset].price
    return { ...b, free, locked, total, usdtVal }
  }).filter(b => b.usdtVal > 0.01).sort((a,b) => b.usdtVal - a.usdtVal)

  const totalUSDT = withValue.reduce((sum, b) => sum + b.usdtVal, 0)
  const usdtBal   = withValue.find(b => b.asset === 'USDT')
  const availableForTrading = usdtBal?.free || 0

  const shown = showAll ? withValue : withValue.slice(0, 6)

  const fmtUSD = (n) => `$${Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{background:t.surface,borderRadius:12,padding:'14px 16px',border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>TOTAL VALUE</p>
          <p style={{color:t.amber,fontSize:20,fontWeight:900,fontFamily:'JetBrains Mono,monospace'}}>{fmtUSD(totalUSDT)}</p>
          <p style={{color:t.muted,fontSize:10,marginTop:3}}>USDT equivalent</p>
        </div>
        <div style={{background:t.surface,borderRadius:12,padding:'14px 16px',border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>AVAILABLE (USDT)</p>
          <p style={{color:availableForTrading > 0 ? t.green : t.muted,fontSize:20,fontWeight:900,fontFamily:'JetBrains Mono,monospace'}}>{fmtUSD(availableForTrading)}</p>
          <p style={{color:t.muted,fontSize:10,marginTop:3}}>ready to trade</p>
        </div>
      </div>

      {/* Holdings */}
      {withValue.length > 0 ? (
        <div style={{background:t.surface,borderRadius:12,border:`1px solid ${t.border}`,overflow:'hidden'}}>
          <div style={{padding:'10px 14px',borderBottom:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:t.text,fontWeight:700,fontSize:13}}>Holdings ({withValue.length})</span>
            <button onClick={load} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:13}}>↻</button>
          </div>
          {shown.map((b,i) => {
            const pct = totalUSDT > 0 ? (b.usdtVal / totalUSDT * 100) : 0
            const price = prices[b.asset]?.price
            const change = prices[b.asset]?.pct || 0
            return (
              <div key={b.asset} style={{padding:'10px 14px',borderBottom:i<shown.length-1?`1px solid ${t.border}22`:'none',display:'flex',alignItems:'center',gap:10}}>
                {/* Asset info */}
                <div style={{width:32,height:32,borderRadius:'50%',background:t.amber+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:t.amber,flexShrink:0}}>
                  {b.asset.slice(0,3)}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontWeight:700,color:t.text,fontSize:13}}>{b.asset}</span>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:t.text,fontSize:13}}>{fmtUSD(b.usdtVal)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:2}}>
                    <span style={{color:t.muted,fontSize:11}}>{b.total.toFixed(b.asset==='BTC'?6:b.asset==='ETH'?4:2)} {b.asset} {price?`@ $${Number(price).toLocaleString('en-US',{maximumFractionDigits:2})}`:''}
                    </span>
                    {change !== 0 && <span style={{color:change>=0?t.green:t.red,fontSize:11,fontWeight:600}}>{change>=0?'+':''}{change.toFixed(2)}%</span>}
                  </div>
                  {/* Portfolio weight bar */}
                  <div style={{height:3,background:t.border,borderRadius:2,marginTop:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:`linear-gradient(90deg,${t.amber},${t.orange})`,borderRadius:2}}/>
                  </div>
                </div>
                <span style={{color:t.muted,fontSize:10,minWidth:32,textAlign:'right'}}>{pct.toFixed(1)}%</span>
              </div>
            )
          })}
          {withValue.length > 6 && (
            <button onClick={()=>setShowAll(s=>!s)} style={{width:'100%',padding:'10px',background:'none',border:'none',color:t.blue,cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:600,borderTop:`1px solid ${t.border}`}}>
              {showAll ? 'Show less ↑' : `Show ${withValue.length - 6} more ↓`}
            </button>
          )}
        </div>
      ) : (
        <div style={{background:t.surface,borderRadius:12,padding:24,border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{fontSize:28,marginBottom:8}}>💰</p>
          <p style={{color:t.text,fontWeight:700,fontSize:14,marginBottom:4}}>No funds yet</p>
          <p style={{color:t.muted,fontSize:12}}>Deposit USDT to start trading crypto</p>
        </div>
      )}

      {/* Locked funds note */}
      {withValue.some(b => b.locked > 0) && (
        <div style={{background:t.amber+'0a',border:`1px solid ${t.amber}22`,borderRadius:10,padding:'8px 12px',fontSize:11,color:t.muted}}>
          🔒 Some funds are locked in open orders. Close orders to free them.
        </div>
      )}
    </div>
  )
}


// ── Reports Tab ────────────────────────────────────────────────
function ReportsTab({t}) {
  const [reports, setReports] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadList() }, [])

  async function loadList() {
    setLoading(true)
    try {
      const r = await fetch('/api/daily-reports?limit=30')
      const d = await r.json()
      const list = d.reports || []
      setReports(list)
      if (list.length > 0) loadDetail(list[0].report_date)
    } catch {}
    setLoading(false)
  }

  async function loadDetail(date) {
    setSelected(date)
    setDetail(null)
    try {
      const r = await fetch(`/api/daily-reports?date=${date}`)
      const d = await r.json()
      setDetail(d.report || null)
    } catch {}
  }

  const fmtD = d => new Date(d).toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',timeZone:'UTC'})

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Daily Reports</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:4}}>Morning briefs and daily summaries — saved automatically, viewable anytime. AI runs once per day and is cached forever.</p>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{width:28,height:28,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
        </div>
      ) : reports.length === 0 ? (
        <div style={{background:t.card,borderRadius:16,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{fontSize:40,marginBottom:12}}>📅</p>
          <p style={{color:t.text,fontWeight:700,marginBottom:8}}>No reports yet</p>
          <p style={{color:t.muted,fontSize:13}}>Reports save automatically at 9 AM and 3:35 PM via Railway. Check back after market hours.</p>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:16,alignItems:'start'}}>
          <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
            <div style={{padding:'10px 14px',borderBottom:`1px solid ${t.border}`,fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>HISTORY</div>
            {reports.map(r => (
              <div key={r.report_date} onClick={() => loadDetail(r.report_date)}
                style={{padding:'12px 14px',borderBottom:`1px solid ${t.border}`,cursor:'pointer',
                  background:selected===r.report_date?'#ff660014':'transparent',
                  borderLeft:selected===r.report_date?'3px solid #ff6600':'3px solid transparent'}}>
                <p style={{fontWeight:600,fontSize:13,color:selected===r.report_date?'#ff6600':t.text,marginBottom:2}}>{fmtD(r.report_date)}</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {r.morning_brief&&<span style={{fontSize:10,color:t.green}}>☀️ brief</span>}
                  {r.daily_summary&&<span style={{fontSize:10,color:t.blue}}>📊 summary</span>}
                  {r.pnl_today!==0&&<span style={{fontSize:10,color:r.pnl_today>0?t.green:t.red,fontWeight:700}}>{r.pnl_today>0?'+':''}₹{Math.abs(r.pnl_today||0).toFixed(0)}</span>}
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {!detail ? (
              <div style={{background:t.card,borderRadius:14,padding:30,border:`1px solid ${t.border}`,textAlign:'center'}}>
                <div style={{width:24,height:24,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
              </div>
            ) : (
              <>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                  {[
                    {l:'TRADES',v:detail.trades_today||0,c:t.text},
                    {l:'P&L',v:`${(detail.pnl_today||0)>=0?'+':''}₹${Math.abs(detail.pnl_today||0).toFixed(2)}`,c:(detail.pnl_today||0)>=0?t.green:t.red},
                    {l:'DATE',v:fmtD(detail.report_date),c:t.blue},
                  ].map(x=>(
                    <div key={x.l} style={{background:t.card,borderRadius:12,padding:14,border:`1px solid ${t.border}`,textAlign:'center'}}>
                      <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>{x.l}</p>
                      <p style={{color:x.c,fontSize:14,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
                    </div>
                  ))}
                </div>
                {detail.morning_brief&&(
                  <div style={{background:t.card,borderRadius:14,padding:20,border:`1px solid ${t.border}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                      <span style={{fontSize:18}}>☀️</span>
                      <p style={{fontWeight:700,color:t.text,fontSize:15,flex:1}}>Morning Brief</p>
                      <span style={{background:'#ff660018',color:'#ff6600',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:'1px solid #ff660033'}}>CACHED</span>
                    </div>
                    <p style={{color:t.text2,fontSize:13,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{detail.morning_brief}</p>
                  </div>
                )}
                {detail.daily_summary&&(
                  <div style={{background:t.card,borderRadius:14,padding:20,border:`1px solid ${t.border}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                      <span style={{fontSize:18}}>📊</span>
                      <p style={{fontWeight:700,color:t.text,fontSize:15,flex:1}}>Daily Summary</p>
                      <span style={{background:t.blue+'18',color:t.blue,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${t.blue}33`}}>CACHED</span>
                    </div>
                    <p style={{color:t.text2,fontSize:13,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{detail.daily_summary}</p>
                  </div>
                )}
                {!detail.morning_brief&&!detail.daily_summary&&(
                  <div style={{background:t.card,borderRadius:14,padding:24,border:`1px solid ${t.border}`,textAlign:'center'}}>
                    <p style={{color:t.muted,fontSize:13}}>No AI reports saved for this date yet.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Signal Log Tab ─────────────────────────────────────────────
function SignalLogTab({t}) {
  const [signals, setSignals] = useState([])
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')  // all | india | crypto
  const [days,    setDays]    = useState(7)

  useEffect(() => { load() }, [filter, days])

  async function load() {
    setLoading(true)
    try {
      const mkt = filter === 'all' ? '' : `&market=${filter}`
      const r   = await fetch(`/api/signal-history?days=${days}&limit=100${mkt}`)
      const d   = await r.json()
      setSignals(d.signals || [])
      setStats(d.stats || null)
    } catch {}
    setLoading(false)
  }

  const fmtTime = (d) => new Date(d).toLocaleString('en-IN', {
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata'
  })

  const byStrategy = signals.reduce((acc, s) => {
    acc[s.strategy] = acc[s.strategy] || { count:0, buy:0, sell:0, avgConf:0 }
    acc[s.strategy].count++
    acc[s.strategy][s.signal==='BUY'?'buy':'sell']++
    acc[s.strategy].avgConf += s.confidence||0
    return acc
  }, {})

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Signal Log</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:4}}>Every BUY/SELL signal that fires — your strategy track record</p>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
          {[['all','All'],['india','🇮🇳 India'],['crypto','🪙 Crypto']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              style={{padding:'4px 14px',borderRadius:16,border:'none',background:filter===v?'#ff660022':'transparent',
                color:filter===v?'#ff6600':t.muted,fontWeight:filter===v?700:500,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
          {[[1,'1D'],[7,'7D'],[14,'14D'],[30,'30D']].map(([v,l])=>(
            <button key={v} onClick={()=>setDays(v)}
              style={{padding:'4px 12px',borderRadius:16,border:'none',background:days===v?t.blue+'22':'transparent',
                color:days===v?t.blue:t.muted,fontWeight:days===v?700:500,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10,marginBottom:20}}>
          {[
            {l:'TOTAL SIGNALS', v:stats.total,        c:t.text},
            {l:'BUY',           v:stats.buy,           c:t.green},
            {l:'SELL',          v:stats.sell,          c:t.red},
            {l:'ACTED ON',      v:stats.acted,         c:t.blue},
            {l:'AVG CONFIDENCE',v:`${stats.avgConfidence}%`, c:t.amber},
          ].map(x=>(
            <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`,textAlign:'center'}}>
              <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
              <p style={{color:x.c,fontSize:16,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* By strategy breakdown */}
      {Object.keys(byStrategy).length > 0 && (
        <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,marginBottom:20,overflow:'hidden'}}>
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>BY STRATEGY</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))'}}>
            {Object.entries(byStrategy).map(([strat, data]) => (
              <div key={strat} style={{padding:'12px 16px',borderRight:`1px solid ${t.border}`,borderBottom:`1px solid ${t.border}`}}>
                <p style={{color:t.text,fontWeight:700,fontSize:13,marginBottom:4}}>{strat}</p>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{color:t.green,fontSize:12,fontWeight:600}}>↑{data.buy} BUY</span>
                  <span style={{color:t.red,fontSize:12,fontWeight:600}}>↓{data.sell} SELL</span>
                  <span style={{color:t.muted,fontSize:11}}>{(data.avgConf/data.count).toFixed(0)}% avg</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signal list */}
      {loading ? (
        <div style={{textAlign:'center',padding:40}}>
          <div style={{width:28,height:28,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
        </div>
      ) : signals.length === 0 ? (
        <div style={{background:t.card,borderRadius:16,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
          <p style={{fontSize:40,marginBottom:12}}>📊</p>
          <p style={{color:t.text,fontWeight:700,marginBottom:8}}>No signals logged yet</p>
          <p style={{color:t.muted,fontSize:13}}>Signals auto-log when they fire. Open the Signals or Crypto tab to start building your track record.</p>
        </div>
      ) : (
        <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',minWidth:600,borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:t.surface}}>
                {['TIME','SYMBOL','STRATEGY','SIGNAL','CONFIDENCE','PRICE','R:R','MARKET'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.08em',borderBottom:`1px solid ${t.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.map((s,i) => (
                <tr key={s.id} style={{borderBottom:`1px solid ${t.border}22`,background:i%2===0?'transparent':t.surface+'44'}}>
                  <td style={{padding:'10px 14px',color:t.muted,fontSize:11,whiteSpace:'nowrap'}}>{fmtTime(s.fired_at)}</td>
                  <td style={{padding:'10px 14px',fontWeight:800,color:t.text,fontFamily:'JetBrains Mono,monospace'}}>{s.symbol}</td>
                  <td style={{padding:'10px 14px',color:t.text2,fontSize:12,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.strategy}</td>
                  <td style={{padding:'10px 14px'}}>
                    <span style={{background:s.signal==='BUY'?t.green+'22':t.red+'22',color:s.signal==='BUY'?t.green:t.red,
                      padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,border:`1px solid ${s.signal==='BUY'?t.green:t.red}44`}}>
                      {s.signal}
                    </span>
                  </td>
                  <td style={{padding:'10px 14px',fontFamily:'JetBrains Mono,monospace',fontSize:12,
                    color:s.confidence>=70?t.green:s.confidence>=50?t.amber:t.red,fontWeight:600}}>
                    {s.confidence}%
                  </td>
                  <td style={{padding:'10px 14px',fontFamily:'JetBrains Mono,monospace',color:t.text,fontSize:12}}>
                    {s.market==='crypto'?'$':'₹'}{s.price?.toLocaleString('en-IN',{maximumFractionDigits:2})}
                  </td>
                  <td style={{padding:'10px 14px',fontFamily:'JetBrains Mono,monospace',color:t.text2,fontSize:12}}>
                    {s.rr?`1:${s.rr}`:'—'}
                  </td>
                  <td style={{padding:'10px 14px'}}>
                    <span style={{fontSize:11,color:t.muted}}>{s.market==='crypto'?'🪙':'🇮🇳'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}


// ── Backtest Tab ───────────────────────────────────────────────
function BacktestTab({t}) {
  const STRATEGIES = [
    { id:'ema-cross',    name:'EMA 9/21 Crossover',         desc:'Fast/slow EMA crossover with ATR stop' },
    { id:'rsi-reversal', name:'RSI Reversal + Bollinger',    desc:'Oversold/overbought reversals at BB bands' },
    { id:'bb-breakout',  name:'Bollinger Breakout',          desc:'Price breaking out of BB bands with volume' },
    { id:'macd-cross',   name:'MACD Crossover',              desc:'MACD line crossing signal line' },
  ]
  const INSTRUMENTS = {
    india:  ['NIFTY','BANKNIFTY','FINNIFTY'],
    crypto: ['BTC','ETH','SOL','XRP'],
  }

  const [market,    setMarket]    = useState('india')
  const [symbol,    setSymbol]    = useState('NIFTY')
  const [strategy,  setStrategy]  = useState('ema-cross')
  const [timeframe, setTimeframe] = useState('15min')
  const [days,      setDays]      = useState(60)
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [dataStatus, setDataStatus] = useState(null)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => { checkDataStatus() }, [])

  async function checkDataStatus() {
    try {
      const r = await fetch('/api/historical-data?action=status')
      const d = await r.json()
      setDataStatus(d)
    } catch {}
  }

  async function runBackfill() {
    setBackfilling(true)
    try {
      const r = await fetch(`/api/historical-data?action=backfill&days=${days}`)
      const d = await r.json()
      if (d.status === 'success') {
        await checkDataStatus()
        alert('Data loaded successfully!')
      }
    } catch(e) { alert('Backfill failed: ' + e.message) }
    setBackfilling(false)
  }

  async function runBacktest() {
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await fetch(`/api/backtest?symbol=${symbol}&strategy=${strategy}&market=${market}&timeframe=${timeframe}&days=${days}`)
      const d = await r.json()
      if (d.status === 'success') setResult(d)
      else if (d.status === 'insufficient_data') setError(d.message)
      else setError(d.error || 'Backtest failed')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const pnlColor = v => parseFloat(v) > 0 ? t.green : parseFloat(v) < 0 ? t.red : t.muted
  const fmt2 = v => parseFloat(v||0).toFixed(2)

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>🔬 Backtest Engine</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:4}}>
          Test strategies against historical data · ₹10,000 base · 1% risk per trade
        </p>
      </div>

      {/* Data status */}
      <div style={{background:t.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <div>
            <p style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:4}}>HISTORICAL DATA STATUS</p>
            {dataStatus ? (
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                {Object.entries({...dataStatus.intraday_15min||{}, ...dataStatus.daily||{}})
                  .filter(([,v]) => v.count > 0)
                  .slice(0,6)
                  .map(([sym,v]) => (
                    <span key={sym} style={{fontSize:11,color:t.green}}>
                      ✅ {sym}: {v.count} candles
                    </span>
                  ))}
                {Object.keys(dataStatus.intraday_15min||{}).length === 0 &&
                  <span style={{fontSize:11,color:t.amber}}>⚠️ No data yet — click Load Data</span>}
              </div>
            ) : <span style={{fontSize:11,color:t.muted}}>Checking...</span>}
          </div>
          <button onClick={runBackfill} disabled={backfilling}
            style={{padding:'8px 16px',background:t.accentC,border:'none',borderRadius:10,
              color:'#fff',fontWeight:700,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif',
              opacity:backfilling?0.6:1}}>
            {backfilling ? '⏳ Loading...' : '📥 Load Data'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{background:t.card,borderRadius:14,padding:16,border:`1px solid ${t.border}`,marginBottom:16}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:16}}>

          {/* Market */}
          <div>
            <p style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:6}}>MARKET</p>
            <div style={{display:'flex',gap:4}}>
              {['india','crypto'].map(m => (
                <button key={m} onClick={()=>{setMarket(m);setSymbol(m==='india'?'NIFTY':'BTC')}}
                  style={{flex:1,padding:'7px',borderRadius:8,border:`1px solid ${market===m?t.accentC:t.border}`,
                    background:market===m?t.accentC+'22':t.surface,color:market===m?t.accentC:t.muted,
                    fontWeight:700,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
                  {m==='india'?'🇮🇳 India':'🪙 Crypto'}
                </button>
              ))}
            </div>
          </div>

          {/* Symbol */}
          <div>
            <p style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:6}}>SYMBOL</p>
            <select value={symbol} onChange={e=>setSymbol(e.target.value)}
              style={{width:'100%',padding:'8px',borderRadius:8,border:`1px solid ${t.border}`,
                background:t.surface,color:t.text,fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {INSTRUMENTS[market].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Timeframe */}
          <div>
            <p style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:6}}>TIMEFRAME</p>
            <div style={{display:'flex',gap:4}}>
              {['15min','daily'].map(tf => (
                <button key={tf} onClick={()=>setTimeframe(tf)}
                  style={{flex:1,padding:'7px',borderRadius:8,border:`1px solid ${timeframe===tf?t.accentC:t.border}`,
                    background:timeframe===tf?t.accentC+'22':t.surface,color:timeframe===tf?t.accentC:t.muted,
                    fontWeight:700,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Days */}
          <div>
            <p style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:6}}>PERIOD</p>
            <div style={{display:'flex',gap:4}}>
              {[30,60,90].map(d => (
                <button key={d} onClick={()=>setDays(d)}
                  style={{flex:1,padding:'7px',borderRadius:8,border:`1px solid ${days===d?t.accentC:t.border}`,
                    background:days===d?t.accentC+'22':t.surface,color:days===d?t.accentC:t.muted,
                    fontWeight:700,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Strategy selector */}
        <div style={{marginBottom:16}}>
          <p style={{fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:8}}>STRATEGY</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
            {STRATEGIES.map(s => (
              <button key={s.id} onClick={()=>setStrategy(s.id)}
                style={{padding:'10px 12px',borderRadius:10,textAlign:'left',cursor:'pointer',fontFamily:'Inter,sans-serif',
                  border:`1px solid ${strategy===s.id?t.accentC:t.border}`,
                  background:strategy===s.id?t.accentC+'22':t.surface}}>
                <p style={{fontSize:12,fontWeight:700,color:strategy===s.id?t.accentC:t.text,marginBottom:2}}>{s.name}</p>
                <p style={{fontSize:10,color:t.muted}}>{s.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <button onClick={runBacktest} disabled={loading}
          style={{width:'100%',padding:'12px',background:loading?t.surface:t.accentC,
            border:'none',borderRadius:10,color:loading?t.muted:'#fff',
            fontWeight:800,fontSize:14,cursor:loading?'not-allowed':'pointer',fontFamily:'Inter,sans-serif'}}>
          {loading ? '⏳ Running backtest...' : '▶ Run Backtest'}
        </button>

        {error && <p style={{color:t.red,fontSize:12,marginTop:10,textAlign:'center'}}>{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Summary stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:10}}>
            {[
              {l:'TOTAL TRADES', v:result.stats.totalTrades,              c:t.text},
              {l:'WIN RATE',     v:result.stats.winRate+'%',               c:result.stats.winRate>=55?t.green:t.red},
              {l:'NET P&L %',    v:(result.stats.totalPnlPct>=0?'+':'')+fmt2(result.stats.totalPnlPct)+'%', c:pnlColor(result.stats.totalPnlPct)},
              {l:'NET P&L ₹/$',  v:(result.stats.totalPnlAbs>=0?'+':'')+fmt2(result.stats.totalPnlAbs),    c:pnlColor(result.stats.totalPnlAbs)},
              {l:'EXPECTANCY',   v:(result.stats.expectancy>=0?'+':'')+fmt2(result.stats.expectancy)+'%',  c:pnlColor(result.stats.expectancy)},
              {l:'AVG R:R',      v:'1:'+fmt2(result.stats.avgRR),          c:result.stats.avgRR>=1.5?t.green:t.amber},
              {l:'MAX DRAWDOWN', v:'-'+fmt2(result.stats.maxDrawdownPct)+'%', c:t.red},
              {l:'CANDLES USED', v:result.candlesUsed,                    c:t.muted},
            ].map(x=>(
              <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:15,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          {result.equityCurve?.length > 1 && (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,padding:16}}>
              <p style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:12}}>
                EQUITY CURVE — {result.strategy} on {symbol} ({days}d)
              </p>
              <div style={{display:'flex',alignItems:'flex-end',gap:2,height:80}}>
                {result.equityCurve.map((v,i) => {
                  const max = Math.max(...result.equityCurve.map(Math.abs), 0.1)
                  const h   = Math.max(Math.abs(v)/max*72, 2)
                  return <div key={i} title={`Trade ${i+1}: ${v>=0?'+':''}${v}%`}
                    style={{flex:1,height:h+'px',background:v>=0?t.green:t.red,
                      borderRadius:'2px 2px 0 0',opacity:0.8,minWidth:2}}/>
                })}
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:10,color:t.muted}}>Trade 1</span>
                <span style={{fontSize:11,fontWeight:700,color:pnlColor(result.stats.totalPnlPct)}}>
                  Final: {result.stats.totalPnlPct>=0?'+':''}{fmt2(result.stats.totalPnlPct)}%
                </span>
                <span style={{fontSize:10,color:t.muted}}>Trade {result.stats.totalTrades}</span>
              </div>
            </div>
          )}

          {/* Recent trades table */}
          {result.recentTrades?.length > 0 && (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`}}>
                <p style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>
                  RECENT TRADES (last {result.recentTrades.length})
                </p>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',minWidth:500,borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:t.surface}}>
                      {['DATE','DIR','ENTRY','EXIT','P&L%','RESULT','R:R'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,
                          fontWeight:700,color:t.muted,letterSpacing:'0.05em',
                          borderBottom:`1px solid ${t.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.recentTrades.map((tr,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${t.border}22`,
                        background:i%2===0?'transparent':t.surface+'44'}}>
                        <td style={{padding:'8px 12px',color:t.muted,fontSize:11}}>{tr.entryDate}</td>
                        <td style={{padding:'8px 12px',fontWeight:700,color:tr.direction==='BUY'?t.green:t.red}}>{tr.direction}</td>
                        <td style={{padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',color:t.text,fontSize:11}}>{parseFloat(tr.entry).toFixed(0)}</td>
                        <td style={{padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',color:t.text,fontSize:11}}>{parseFloat(tr.exit).toFixed(0)}</td>
                        <td style={{padding:'8px 12px',fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:pnlColor(tr.pnlPct)}}>
                          {tr.pnlPct>=0?'+':''}{fmt2(tr.pnlPct)}%
                        </td>
                        <td style={{padding:'8px 12px'}}>
                          <span style={{padding:'2px 7px',borderRadius:6,fontSize:10,fontWeight:700,
                            background:(tr.exitReason==='TARGET_HIT'?t.green:tr.exitReason==='SL_HIT'?t.red:t.amber)+'22',
                            color:tr.exitReason==='TARGET_HIT'?t.green:tr.exitReason==='SL_HIT'?t.red:t.amber}}>
                            {tr.exitReason==='TARGET_HIT'?'✅ WIN':tr.exitReason==='SL_HIT'?'❌ SL':'⏱ EXP'}
                          </span>
                        </td>
                        <td style={{padding:'8px 12px',color:t.muted,fontFamily:'JetBrains Mono,monospace',fontSize:11}}>1:{fmt2(tr.rr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Paper Trades Tab ───────────────────────────────────────────
function PaperTradesTab({t}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')
  const [days,    setDays]    = useState(30)
  const [view,    setView]    = useState('performance') // performance | trades | reports | signals

  useEffect(() => { load() }, [filter, days])

  async function load() {
    setLoading(true)
    try {
      const status = filter === 'open' ? '&status=OPEN' : filter === 'closed' ? '&status=WIN,LOSS,EXPIRED' : ''
      const r = await fetch(`/api/paper-trades?days=${days}&limit=200${status}`)
      const d = await r.json()
      setData(d)
    } catch(e) { console.warn('Paper trades:', e) }
    setLoading(false)
  }

  const fmtTime  = d => new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})
  const pnlColor = v => v > 0 ? t.green : v < 0 ? t.red : t.muted
  const fmtPct   = v => (v >= 0 ? '+' : '') + parseFloat(v).toFixed(2) + '%'

  // Monthly summary from API
  const monthly  = data?.monthly
  const ranked   = monthly?.strategies_ranked || []

  // Equity curve — cumulative % of base over closed trades sorted by date
  const closed = (data?.trades||[])
    .filter(tr => ['WIN','LOSS','EXPIRED','CLOSED'].includes(tr.status))
    .sort((a,b) => new Date(a.closed_at) - new Date(b.closed_at))
  let cum = 0
  const equityCurve = closed.map(tr => { cum += (tr.pnl_pct||0); return parseFloat(cum.toFixed(2)) })

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>🧪 Paper Trading Performance</h2>
          <p style={{color:t.muted,fontSize:13,marginTop:4}}>
            Fixed base: ₹10,000 (India) · $1,000 (Crypto/Delta) · All P&L% relative to base
          </p>
        </div>
        <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
          {[['performance','📊 Performance'],['trades','📋 Trades'],['reports','📅 Reports'],['signals','📊 Signals']].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:'5px 14px',borderRadius:16,border:'none',
                background:view===v?'#ff660022':'transparent',
                color:view===v?'#ff6600':t.muted,fontWeight:view===v?700:400,
                cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Day/filter controls */}
      <div style={{display:'flex',gap:10,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
          {[[7,'7D'],[30,'30D'],[90,'90D']].map(([v,l])=>(
            <button key={v} onClick={()=>setDays(v)}
              style={{padding:'4px 12px',borderRadius:16,border:'none',
                background:days===v?t.blue+'22':'transparent',
                color:days===v?t.blue:t.muted,fontWeight:days===v?700:400,
                cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={load} style={{padding:'4px 12px',background:'none',border:`1px solid ${t.border}`,borderRadius:20,color:t.muted,cursor:'pointer',fontSize:12}}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40}}>
          <div style={{width:28,height:28,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
        </div>
      ) : view === 'performance' ? (
        <div>

          {/* ── Monthly Summary Cards ── */}
          {monthly && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:20}}>
              {[
                {l:'BASE CAPITAL',  v:'₹10,000',                                         c:t.muted},
                {l:'TOTAL TRADES',  v:data.stats?.total || 0,                             c:t.text},
                {l:'WIN RATE',      v:data.stats?.winRate ? data.stats.winRate+'%' : '—', c:parseFloat(data.stats?.winRate||0)>=55?t.green:t.red},
                {l:'NET P&L %',     v:fmtPct(monthly.total_pnl_pct||0),                  c:pnlColor(monthly.total_pnl_pct)},
                {l:'NET P&L ₹',     v:'₹'+parseFloat(monthly.total_pnl_inr||0).toFixed(0), c:pnlColor(monthly.total_pnl_inr)},
                {l:'EXPECTANCY',    v:data.stats?.expectancy ? fmtPct(data.stats.expectancy) : '—', c:parseFloat(data.stats?.expectancy||0)>0?t.green:t.red},
              ].map(x=>(
                <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                  <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
                  <p style={{color:x.c,fontSize:15,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Strategy Leaderboard ── */}
          {ranked.length > 0 && (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,marginBottom:20,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>STRATEGY LEADERBOARD — {days}D</span>
                <span style={{fontSize:11,color:t.muted}}>Ranked by P&L% of ₹10k base</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',minWidth:650,borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:t.surface}}>
                      {['#','STRATEGY','MARKET','TRADES','WIN%','RISK%/TRADE','P&L%','P&L ₹','AVG R:R','VERDICT'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',borderBottom:`1px solid ${t.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((s, i) => {
                      const base    = (s.market==='crypto'||s.market==='delta') ? 1000 : 10000
                      const curr    = (s.market==='crypto'||s.market==='delta') ? '$'  : '₹'
                      const pnlInr  = parseFloat(((s.pnl_pct/100)*base).toFixed(0))
                      const verdict = s.winRate >= 55 && s.pnl_pct > 0 ? '✅ KEEP'
                                    : s.winRate < 40 || s.pnl_pct < -3 ? '❌ REMOVE'
                                    : '⚠️ WATCH'
                      const riskPct = s.total > 0 ? (1.0).toFixed(1) : '—' // fixed 1% risk per trade
                      return (
                        <tr key={s.name} style={{borderBottom:`1px solid ${t.border}22`,background:i%2===0?'transparent':t.surface+'44'}}>
                          <td style={{padding:'8px 8px',color:t.muted,fontSize:11,fontWeight:700}}>#{i+1}</td>
                          <td style={{padding:'10px 12px',fontWeight:700,color:t.text,fontSize:13}}>{s.name}</td>
                          <td style={{padding:'10px 12px',fontSize:11,color:t.muted}}>{s.market||'india'}</td>
                          <td style={{padding:'10px 12px',color:t.muted,fontSize:12}}>{s.total} ({s.wins}W/{s.losses}L)</td>
                          <td style={{padding:'10px 12px',color:s.winRate>=55?t.green:s.winRate<40?t.red:t.amber,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{s.winRate}%</td>
                          <td style={{padding:'10px 12px',color:t.muted,fontFamily:'JetBrains Mono,monospace',fontSize:12}}>1.0%</td>
                          <td style={{padding:'10px 12px',color:pnlColor(s.pnl_pct),fontFamily:'JetBrains Mono,monospace',fontWeight:700}}>{fmtPct(s.pnl_pct)}</td>
                          <td style={{padding:'10px 12px',color:pnlColor(pnlInr),fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{curr}{Math.abs(pnlInr)}</td>
                          <td style={{padding:'10px 12px',color:t.muted,fontFamily:'JetBrains Mono,monospace',fontSize:12}}>1:{s.avgRR||'—'}</td>
                          <td style={{padding:'10px 12px',fontSize:12,fontWeight:700}}>{verdict}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr style={{background:t.surface,borderTop:`2px solid ${t.border}`}}>
                      <td colSpan={6} style={{padding:'10px 12px',fontWeight:700,color:t.text,fontSize:12}}>TOTAL</td>
                      <td style={{padding:'10px 12px',color:pnlColor(monthly?.total_pnl_pct),fontFamily:'JetBrains Mono,monospace',fontWeight:800}}>{fmtPct(monthly?.total_pnl_pct||0)}</td>
                      <td style={{padding:'10px 12px',color:pnlColor(monthly?.total_pnl_inr),fontFamily:'JetBrains Mono,monospace',fontWeight:800}}>₹{parseFloat(monthly?.total_pnl_inr||0).toFixed(0)}</td>
                      <td colSpan={2}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ── Equity Curve (simple bar visualization) ── */}
          {equityCurve.length > 1 && (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,padding:16,marginBottom:20}}>
              <p style={{fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em',marginBottom:12}}>EQUITY CURVE — CUMULATIVE P&L % OF BASE</p>
              <div style={{display:'flex',alignItems:'flex-end',gap:2,height:80,paddingBottom:4}}>
                {equityCurve.map((v,i) => {
                  const max    = Math.max(...equityCurve.map(Math.abs), 1)
                  const height = Math.max(Math.abs(v)/max*70, 2)
                  return (
                    <div key={i} title={`Trade ${i+1}: ${v>=0?'+':''}${v}%`}
                      style={{flex:1,height:height+'px',background:v>=0?t.green:t.red,
                        borderRadius:'2px 2px 0 0',opacity:0.8,minWidth:3,cursor:'pointer'}}/>
                  )
                })}
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:10,color:t.muted}}>Trade 1</span>
                <span style={{fontSize:11,fontWeight:700,color:pnlColor(cum)}}>
                  Total: {fmtPct(cum)}
                </span>
                <span style={{fontSize:10,color:t.muted}}>Trade {closed.length}</span>
              </div>
            </div>
          )}

          {/* No data state */}
          {!data?.trades?.length && (
            <div style={{background:t.card,borderRadius:16,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
              <p style={{fontSize:40,marginBottom:12}}>🧪</p>
              <p style={{color:t.text,fontWeight:700,marginBottom:8}}>No paper trades yet</p>
              <p style={{color:t.muted,fontSize:13}}>
                Signals with ≥65% confidence auto-create paper trades.<br/>
                The worker monitors SL/target every 5 seconds and records WIN/LOSS automatically.
              </p>
            </div>
          )}

        </div>
      ) : view === 'reports' ? (
        <ReportsTab t={t} />
      ) : view === 'signals' ? (
        <SignalLogTab t={t} />
      ) : (
        /* ── Trades List View ── */
        <div>
          <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1,marginBottom:16,width:'fit-content'}}>
            {[['all','All'],['open','Open'],['closed','Closed']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                style={{padding:'4px 14px',borderRadius:16,border:'none',
                  background:filter===v?'#ff660022':'transparent',
                  color:filter===v?'#ff6600':t.muted,fontWeight:filter===v?700:400,
                  cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
                {l}
              </button>
            ))}
          </div>

          {!data?.trades?.length ? (
            <div style={{background:t.card,borderRadius:16,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
              <p style={{color:t.muted}}>No trades found</p>
            </div>
          ) : (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
              <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
                <table style={{width:'100%',minWidth:750,borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{background:t.surface}}>
                      {['OPENED','SYMBOL','STRATEGY','DIR','ENTRY','SL','TARGET','QTY','RISK%','EXIT','P&L%','STATUS'].map(h=>(
                        <th key={h} style={{padding:'7px 8px',textAlign:'left',fontSize:9,fontWeight:700,color:t.muted,letterSpacing:'0.04em',borderBottom:`1px solid ${t.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.trades||[]).map((tr,i) => {
                      const statusColor = tr.status==='WIN'?t.green:tr.status==='LOSS'?t.red:tr.status==='OPEN'?t.amber:t.muted
                      const base   = (tr.market==='crypto'||tr.market==='delta') ? 1000 : 10000
                      const riskPts = tr.stop_loss ? Math.abs(tr.entry_price - tr.stop_loss) * (tr.quantity||1) : null
                      const riskPct = riskPts ? ((riskPts/base)*100).toFixed(2) : '—'
                      return (
                        <tr key={tr.id} style={{borderBottom:`1px solid ${t.border}22`,background:i%2===0?'transparent':t.surface+'44'}}>
                          <td style={{padding:'8px 10px',color:t.muted,fontSize:11,whiteSpace:'nowrap'}}>{fmtTime(tr.opened_at)}</td>
                          <td style={{padding:'8px 10px',fontWeight:700,color:t.text,fontSize:13}}>{tr.symbol}</td>
                          <td style={{padding:'8px 10px',color:t.muted,fontSize:11}}>{tr.strategy}</td>
                          <td style={{padding:'8px 10px',color:tr.direction==='BUY'?t.green:t.red,fontWeight:700,fontSize:12}}>{tr.direction}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>{tr.entry_price}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:t.red}}>{tr.stop_loss||'—'}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:t.green}}>{tr.target||'—'}</td>
                          <td style={{padding:'8px 10px',color:t.muted,fontSize:12}}>{tr.quantity||1}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:t.amber}}>{riskPct !== '—' ? riskPct+'%' : '—'}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:t.muted}}>{tr.exit_price||'—'}</td>
                          <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:pnlColor(tr.pnl_pct)}}>{tr.pnl_pct != null ? fmtPct(tr.pnl_pct) : '—'}</td>
                          <td style={{padding:'8px 10px'}}>
                            <span style={{background:statusColor+'22',color:statusColor,padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700}}>
                              {tr.status==='WIN'?'✅ WIN':tr.status==='LOSS'?'❌ LOSS':tr.status==='OPEN'?'⏳ OPEN':'—'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── Delta Portfolio Panel ──────────────────────────────────────
function DeltaPortfolioPanel({t}) {
  const [wallet,    setWallet]    = useState(null)
  const [positions, setPositions] = useState([])
  const [fills,     setFills]     = useState([])
  const [prices,    setPrices]    = useState({})
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [showFills, setShowFills] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      // Fetch prices (public - always works)
      const priceR = await fetch('/api/delta?action=prices')
      const priceD = await priceR.json()
      if (priceD.prices) setPrices(priceD.prices)

      // Fetch wallet (needs IP whitelist)
      const walletR = await fetch('/api/delta?action=wallet')
      if (walletR.ok) {
        const walletD = await walletR.json()
        if (walletD.status === 'success') setWallet(walletD)
        else setError(walletD.error || 'Connection error')
      } else {
        const err = await walletR.json()
        setError(err.error || 'Delta API not reachable')
      }

      // Fetch open positions
      const posR = await fetch('/api/delta?action=positions')
      if (posR.ok) {
        const posD = await posR.json()
        if (posD.positions) setPositions(posD.positions)
      }

      // Fetch trade history (fills)
      const fillsR = await fetch('/api/delta-fills?page_size=50')
      if (fillsR.ok) {
        const fillsD = await fillsR.json()
        if (fillsD.fills) setFills(fillsD.fills)
      }
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const usdToInr = (usd) => `₹${(usd * 84).toLocaleString('en-IN', {maximumFractionDigits:0})}`
  const fmtUSD   = (v) => `$${parseFloat(v||0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}`

  const totalUSD  = wallet?.totalUSD || 0
  const totalINR  = totalUSD * 84

  // Live P&L on open positions
  const unrealPnL = positions.reduce((a, p) => a + (p.unrealizedPnL || 0), 0)

  return (
    <div style={{marginTop:20,background:t.card,borderRadius:20,padding:22,border:`1px solid ${t.border}`}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:22}}>⚡</span>
          <div>
            <p style={{fontWeight:800,fontSize:15,color:t.text}}>Delta Exchange</p>
            <p style={{color:t.muted,fontSize:12}}>Perpetual Futures · Up to 200x leverage</p>
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {error ? (
            <span style={{background:t.red+'15',color:t.red,fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,border:`1px solid ${t.red}33`}}>
              ⚠️ {error.includes('IP') || error.includes('proxy') ? 'IP not whitelisted — add Fixie' : 'Connection error'}
            </span>
          ) : (
            <span style={{background:t.green+'15',color:t.green,fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,border:`1px solid ${t.green}33`}}>
              ✅ Connected
            </span>
          )}
          <button onClick={load} style={{background:'none',border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:12,padding:'4px 10px'}}>
            {loading ? '⏳' : '↻'}
          </button>
        </div>
      </div>

      {/* IP error message */}
      {error && (error.includes('proxy') || error.includes('401') || error.includes('IP')) && (
        <div style={{background:t.amber+'0d',border:`1px solid ${t.amber}33`,borderRadius:12,padding:'12px 16px',marginBottom:16}}>
          <p style={{color:t.amber,fontWeight:700,fontSize:13,marginBottom:4}}>⚡ Delta trading needs a fixed IP</p>
          <p style={{color:t.muted,fontSize:12}}>
            Add <b>Fixie</b> add-on to Railway (~₹400/mo) → whitelist Fixie IPs on Delta → wallet and trading go live.
            Prices and signals work without this.
          </p>
        </div>
      )}

      {/* Live prices row */}
      <div style={{display:'flex',gap:10,overflowX:'auto',marginBottom:16,paddingBottom:4}}>
        {Object.entries(prices).map(([sym, p]) => (
          <div key={sym} style={{background:t.surface,borderRadius:12,padding:'10px 14px',border:`1px solid ${t.border}`,flexShrink:0,minWidth:110}}>
            <p style={{fontWeight:800,fontSize:12,color:t.text,marginBottom:2}}>{sym}/USD</p>
            <p style={{fontSize:14,fontWeight:700,fontFamily:'JetBrains Mono,monospace',color:t.text}}>
              ${parseFloat(p.price||0).toLocaleString('en-US',{maximumFractionDigits:2})}
            </p>
            <p style={{fontSize:11,color:(p.pct||0)>=0?t.green:t.red,fontWeight:600}}>
              {(p.pct||0)>=0?'+':''}{(p.pct||0).toFixed(2)}%
            </p>
            <p style={{fontSize:9,color:t.muted,marginTop:2}}>
              FR: {((p.fundingRate||0)*100).toFixed(4)}%
            </p>
          </div>
        ))}
      </div>

      {/* Wallet balances */}
      {wallet && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:16}}>
            {[
              {l:'TOTAL VALUE', v:fmtUSD(totalUSD),     s:usdToInr(totalUSD), c:'#ff6600'},
              {l:'AVAILABLE',   v:fmtUSD(wallet.balances?.find(b=>b.asset==='USD')?.availableBalance||0),
                                s:'ready to trade',    c:t.green},
              {l:'OPEN P&L',    v:(unrealPnL>=0?'+':'')+fmtUSD(unrealPnL), s:'unrealised', c:unrealPnL>=0?t.green:t.red},
              {l:'POSITIONS',   v:positions.length,     s:'open now',         c:t.text},
            ].map(x=>(
              <div key={x.l} style={{background:t.surface,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`}}>
                <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:15,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
                <p style={{color:t.muted,fontSize:10,marginTop:2}}>{x.s}</p>
              </div>
            ))}
          </div>

          {/* Asset breakdown */}
          {wallet.balances?.filter(b=>b.balance>0).length > 0 && (
            <div style={{marginBottom:16}}>
              <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:8,letterSpacing:'0.06em'}}>ASSETS</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {wallet.balances.filter(b=>b.balance>0).map(b=>(
                  <div key={b.asset} style={{background:t.surface,borderRadius:10,padding:'8px 14px',border:`1px solid ${t.border}`}}>
                    <p style={{fontWeight:700,color:t.text,fontSize:13}}>{b.asset}</p>
                    <p style={{fontFamily:'JetBrains Mono,monospace',color:t.text2,fontSize:12}}>{parseFloat(b.balance).toFixed(4)}</p>
                    <p style={{color:t.muted,fontSize:10}}>avail: {parseFloat(b.availableBalance).toFixed(4)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Open positions */}
      {positions.length > 0 ? (
        <div>
          <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:8,letterSpacing:'0.06em'}}>OPEN POSITIONS ({positions.length})</p>
          <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          <table style={{width:'100%',minWidth:500,borderCollapse:'collapse',background:t.surface,borderRadius:10,overflow:'hidden'}}>
            <thead><tr style={{borderBottom:`1px solid ${t.border}`}}>
              {['SYMBOL','SIDE','SIZE','ENTRY','MARK','P&L','LEVERAGE','LIQ. PRICE'].map(h=>(
                <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {positions.map((p,i)=>(
                <tr key={i} style={{borderTop:`1px solid ${t.border}22`}}>
                  <td style={{padding:'9px 12px',fontWeight:800,color:t.text,fontFamily:'JetBrains Mono,monospace'}}>{p.symbol}</td>
                  <td style={{padding:'9px 12px',color:p.side==='BUY'?t.green:t.red,fontWeight:700,fontSize:12}}>{p.side==='BUY'?'▲ LONG':'▼ SHORT'}</td>
                  <td style={{padding:'9px 12px',color:t.text2,fontSize:12}}>{p.size}</td>
                  <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>${parseFloat(p.entryPrice||0).toLocaleString('en-US',{maximumFractionDigits:2})}</td>
                  <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>${parseFloat(p.markPrice||0).toLocaleString('en-US',{maximumFractionDigits:2})}</td>
                  <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:12,color:parseFloat(p.unrealizedPnL||0)>=0?t.green:t.red}}>
                    {parseFloat(p.unrealizedPnL||0)>=0?'+':''}${parseFloat(p.unrealizedPnL||0).toFixed(2)}
                  </td>
                  <td style={{padding:'9px 12px',color:t.amber,fontWeight:700,fontSize:12}}>{p.leverage}x</td>
                  <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.red}}>${parseFloat(p.liquidationPrice||0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : !error && !loading && (
        <div style={{textAlign:'center',padding:'20px 0',color:t.muted,fontSize:13}}>
          No open positions · Start trading from the ⚡ Delta tab
        </div>
      )}

      {loading && (
        <div style={{textAlign:'center',padding:20}}>
          <div style={{width:20,height:20,border:`3px solid ${t.border}`,borderTopColor:'#ff6600',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/>
        </div>
      )}

      {/* Trade History (Fills) */}
      {fills.length > 0 && (
        <div style={{marginTop:20,borderTop:`1px solid ${t.border}`,paddingTop:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <p style={{fontWeight:700,fontSize:13,color:t.text}}>📋 Trade History ({fills.length} fills)</p>
            <button onClick={()=>setShowFills(v=>!v)}
              style={{padding:'4px 12px',background:t.surface,border:`1px solid ${t.border}`,
                borderRadius:8,color:t.muted,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
              {showFills ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>
          {showFills && (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',minWidth:450,borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:t.surface}}>
                    {['DATE','SYMBOL','SIDE','QTY','PRICE','VALUE'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',color:t.muted,
                        fontSize:10,fontWeight:700,letterSpacing:'0.05em',
                        borderBottom:`1px solid ${t.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fills.map((f,i)=>(
                    <tr key={f.id||i} style={{borderBottom:`1px solid ${t.border}22`,
                      background:i%2===0?'transparent':t.surface+'44'}}>
                      <td style={{padding:'8px 10px',color:t.muted,fontSize:11}}>
                        {f.date}
                      </td>
                      <td style={{padding:'8px 10px',fontWeight:700,color:t.text}}>
                        {f.symbol}
                      </td>
                      <td style={{padding:'8px 10px',fontWeight:700,
                        color:f.side==='buy'?t.green:t.red}}>
                        {f.side?.toUpperCase()}
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',color:t.text}}>
                        {f.size}
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',color:t.text}}>
                        ${parseFloat(f.price).toLocaleString('en-US',{maximumFractionDigits:2})}
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:'JetBrains Mono,monospace',color:t.muted}}>
                        ${parseFloat(f.value||0).toLocaleString('en-US',{maximumFractionDigits:0})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// TickerBar replaced by LiveTicker above


// ── Options Chain Tab ──────────────────────────────────────────
function OptionsTab({t, defaultSymbol}) {
  const [symbol,  setSymbol]  = useState(defaultSymbol || 'NIFTY')
  const [expiry,  setExpiry]  = useState('')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(()=>{ setExpiry(''); load('') }, [symbol])

  async function load(exp) {
    setLoading(true); setError(''); setData(null)
    try {
      const expParam = exp ? `&expiry=${exp}` : ''
      const r = await fetch(`/api/options-chain?symbol=${symbol}${expParam}`)
      const d = await r.json()
      if (d.status === 'success') {
        setData(d)
      } else if (d.status === 'no_session' || d.action === 'login_required') {
        setError('login_required')
      } else if (d.status === 'unavailable' || d.status === 'partial') {
        setError(d.message || 'Options chain unavailable during market hours.')
        if (d.spotPrice) setData({...d, chain: []})
      } else {
        setError(d.error || d.message || 'Failed to load options chain')
      }
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const fmtOI  = (n) => n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(0)+'K' : n
  const fmtRs  = (n) => n ? `₹${n.toFixed(1)}` : '—'

  return (
    <div>
      <div style={{marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Options Chain</h2>
          <p style={{color:t.muted,fontSize:13,marginTop:5}}>NSE live options · OI · LTP · IV · PCR · Max Pain</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {['NIFTY','BANKNIFTY','FINNIFTY'].map(s=>(
            <button key={s} onClick={()=>setSymbol(s)}
              style={{padding:'8px 20px',borderRadius:10,border:`1px solid ${symbol===s?t.blue:t.border}`,background:symbol===s?t.blue+'22':t.surface,color:symbol===s?t.blue:t.muted,fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              {s}
            </button>
          ))}
          <button onClick={load} style={{padding:'8px 14px',borderRadius:10,border:`1px solid ${t.border}`,background:t.surface,color:t.muted,cursor:'pointer',fontSize:13}}>↻</button>
        </div>
      </div>

      {loading&&<div style={{textAlign:'center',padding:40}}><div style={{width:32,height:32,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/><p style={{color:t.muted}}>Loading Zerodha options chain...</p></div>}

      {error && error === 'login_required' && (
        <div style={{background:t.amber+'11',border:`1px solid ${t.amber}33`,borderRadius:14,padding:32,textAlign:'center'}}>
          <p style={{fontSize:36,marginBottom:8}}>🔐</p>
          <p style={{color:t.amber,fontWeight:700,fontSize:16,marginBottom:8}}>Zerodha Login Required</p>
          <p style={{color:t.muted,fontSize:13,marginBottom:20}}>
            Options chain uses your live Zerodha account for real-time data.<br/>
            Login once per day — session lasts until midnight.
          </p>
          <button onClick={()=>window.location.href='/api/kite-login'}
            style={{padding:'12px 32px',background:'#ff6600',border:'none',borderRadius:12,
              color:'#fff',cursor:'pointer',fontWeight:700,fontSize:14,fontFamily:'Inter,sans-serif'}}>
            Login with Zerodha →
          </button>
        </div>
      )}
      {error && error !== 'login_required' && (
        <div style={{background:t.red+'11',border:`1px solid ${t.red}33`,borderRadius:14,padding:24,textAlign:'center'}}>
          <p style={{fontSize:28,marginBottom:8}}>⚠️</p>
          <p style={{color:t.red,fontWeight:700,marginBottom:6}}>Options Chain Error</p>
          <p style={{color:t.muted,fontSize:13}}>{error}</p>
          <button onClick={load} style={{marginTop:12,padding:'8px 20px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Try Again</button>
        </div>
      )}

      {!loading&&!error&&data&&(
        <>
          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'SPOT PRICE', v:`₹${data.spotPrice?.toLocaleString('en-IN',{maximumFractionDigits:1})}`, c:t.text},
              {l:'EXPIRY',     v:data.expiry, c:t.blue},
              {l:'PCR',       v:data.pcr, c:data.pcr>1.3?t.green:data.pcr<0.7?t.red:t.amber, s:data.pcrSentiment},
              {l:'MAX PAIN',  v:`₹${data.maxPain?.toLocaleString('en-IN')}`, c:t.purple, s:'Strike with max OI'},
            ].map(x=>(
              <div key={x.l} style={{background:t.card,borderRadius:14,padding:'14px 16px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:16,fontWeight:900,fontFamily:'monospace'}}>{x.v}</p>
                {x.s&&<p style={{color:t.muted,fontSize:10,marginTop:4}}>{x.s}</p>}
              </div>
            ))}
          </div>

          {/* Expiry selector */}
          {data?.expiries && data.expiries.length > 1 && (
            <div style={{marginBottom:16}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.06em',marginBottom:8}}>EXPIRY</p>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {data.expiries.map(e => {
                  const dt = new Date(e)
                  const day = dt.toLocaleDateString('en-IN',{weekday:'short'})
                  const date = dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})
                  const isSelected = expiry === e
                  const isWeekly = data.expiries.indexOf(e) < 4 && symbol === 'NIFTY'
                  return (
                    <button key={e} onClick={()=>{ setExpiry(e); load(e) }}
                      style={{padding:'6px 12px',borderRadius:8,
                        border:`1px solid ${isSelected?t.accentC:t.border}`,
                        background:isSelected?t.accentC+'22':t.surface,
                        color:isSelected?t.accentC:t.muted,
                        fontWeight:isSelected?700:400,
                        cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif',
                        textAlign:'center',lineHeight:1.4}}>
                      <span style={{display:'block',fontSize:9,opacity:0.7}}>{day}</span>
                      {date}
                      {isWeekly && <span style={{display:'block',fontSize:9,color:t.green}}>weekly</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Options table */}
          <div style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,overflow:'auto'}}>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 0.6fr 0.6fr 0.6fr 0.8fr 0.8fr 1fr 0.6fr 0.6fr 0.6fr',gap:0,padding:'10px 16px',background:t.surface,borderBottom:`1px solid ${t.border}`,fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.07em',minWidth:700}}>
              <span>CALL OI</span><span>CALL VOL</span><span>CALL IV</span><span>CALL LTP</span>
              <span style={{textAlign:'center',color:t.text}}>STRIKE</span>
              <span style={{textAlign:'right'}}>PUT LTP</span><span style={{textAlign:'right'}}>PUT IV</span><span style={{textAlign:'right'}}>PUT VOL</span><span style={{textAlign:'right'}}>PUT OI</span><span/>
            </div>
            {data.chain.map(row=>(
              <div key={row.strike}
                style={{display:'grid',gridTemplateColumns:'1fr 0.6fr 0.6fr 0.6fr 0.8fr 0.8fr 1fr 0.6fr 0.6fr 0.6fr',gap:0,padding:'8px 16px',borderBottom:`1px solid ${t.border}`,fontSize:12,minWidth:700,background:row.isATM?t.blue+'0a':'transparent'}}>
                <span style={{color:t.green,fontFamily:'monospace',fontWeight:row.isATM?700:400}}>{fmtOI(row.call?.oi||0)}</span>
                <span style={{color:t.muted,fontFamily:'monospace'}}>{fmtOI(row.call?.volume||0)}</span>
                <span style={{color:t.muted,fontFamily:'monospace'}}>{row.call?.iv?.toFixed(1)||'—'}%</span>
                <span style={{color:t.text,fontFamily:'monospace',fontWeight:600}}>{fmtRs(row.call?.ltp)}</span>
                <span style={{textAlign:'center',fontWeight:900,color:row.isATM?t.blue:t.text,fontFamily:'monospace',fontSize:row.isATM?14:12}}>
                  {row.strike?.toLocaleString('en-IN')}
                  {row.isATM&&<span style={{fontSize:9,color:t.blue,display:'block'}}>ATM</span>}
                </span>
                <span style={{textAlign:'right',color:t.text,fontFamily:'monospace',fontWeight:600}}>{fmtRs(row.put?.ltp)}</span>
                <span style={{textAlign:'right',color:t.muted,fontFamily:'monospace'}}>{row.put?.iv?.toFixed(1)||'—'}%</span>
                <span style={{textAlign:'right',color:t.muted,fontFamily:'monospace'}}>{fmtOI(row.put?.volume||0)}</span>
                <span style={{textAlign:'right',color:t.red,fontFamily:'monospace',fontWeight:row.isATM?700:400}}>{fmtOI(row.put?.oi||0)}</span>
                <span/>
              </div>
            ))}
          </div>
          <p style={{color:t.muted,fontSize:11,marginTop:10,textAlign:'center'}}>Green OI = Calls (bears) · Red OI = Puts (bulls) · High Put OI = support level · High Call OI = resistance</p>
        </>
      )}
    </div>
  )
}


// ── Alerts Tab — Price Alerts ──────────────────────────────────
function AlertsTab({t}) {
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({symbol:'NIFTY',market:'india',condition:'above',price:'',note:''})
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    try{const r=await fetch('/api/price-alerts');const d=await r.json();setAlerts(d.alerts||[])}catch{}
    setLoading(false)
  }

  async function create(){
    if(!form.price||isNaN(form.price)){setMsg('Enter a valid price');return}
    setSaving(true)
    const r=await fetch('/api/price-alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const d=await r.json()
    if(d.alert){setMsg('✅ Alert created!');setForm(f=>({...f,price:'',note:''}));load()}
    else setMsg('❌ '+d.error)
    setSaving(false)
    setTimeout(()=>setMsg(''),3000)
  }

  async function remove(id){
    await fetch('/api/price-alerts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    load()
  }

  const SYMS_INDIA  = ['NIFTY','BANKNIFTY','SENSEX','TCS','INFY','RELIANCE','HDFCBANK','ICICIBANK','SBIN','WIPRO']
  const SYMS_CRYPTO = ['BTC','ETH','SOL','BNB','XRP','DOGE']
  const syms = form.market==='crypto' ? SYMS_CRYPTO : SYMS_INDIA
  const curr = form.market==='crypto' ? '$' : '₹'

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Price Alerts</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:5}}>Set alerts — Telegram notification when price hits your level</p>
      </div>

      {/* Create Alert Form */}
      <div style={{background:t.card,borderRadius:20,padding:24,border:`1px solid ${t.border}`,marginBottom:20}}>
        <p style={{color:t.text,fontWeight:700,fontSize:15,marginBottom:16}}>🔔 Create New Alert</p>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:16}}>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>MARKET</p>
            <select value={form.market} onChange={e=>setForm(f=>({...f,market:e.target.value,symbol:e.target.value==='crypto'?'BTC':'NIFTY'}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Inter,sans-serif'}}>
              <option value="india">🇮🇳 Indian</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>SYMBOL</p>
            <select value={form.symbol} onChange={e=>setForm(f=>({...f,symbol:e.target.value}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Inter,sans-serif'}}>
              {syms.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>CONDITION</p>
            <select value={form.condition} onChange={e=>setForm(f=>({...f,condition:e.target.value}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Inter,sans-serif'}}>
              <option value="above">↑ Price goes above</option>
              <option value="below">↓ Price goes below</option>
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>TARGET PRICE ({curr})</p>
            <input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}
              placeholder={form.market==='crypto'?'e.g. 80000':'e.g. 24500'}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'monospace',boxSizing:'border-box'}}/>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>NOTE (optional)</p>
          <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
            placeholder="e.g. ORB breakout level, resistance zone..."
            style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Inter,sans-serif',boxSizing:'border-box'}}/>
        </div>

        {msg&&<p style={{color:msg.includes('✅')?t.green:t.red,fontSize:13,marginBottom:10,fontWeight:600}}>{msg}</p>}

        <button onClick={create} disabled={saving}
          style={{padding:'12px 28px',background:`linear-gradient(135deg,${t.blue},${t.purple})`,border:'none',borderRadius:12,color:'#fff',fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'Inter,sans-serif',fontSize:14,boxShadow:`0 4px 16px ${t.blue}33`}}>
          {saving?'Creating...':'🔔 Create Alert'}
        </button>
      </div>

      {/* Active Alerts */}
      <div style={{background:t.card,borderRadius:20,border:`1px solid ${t.border}`,overflow:'hidden'}}>
        <div style={{padding:'16px 22px',borderBottom:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <p style={{fontWeight:700,color:t.text}}>Active Alerts ({alerts.filter(a=>!a.triggered).length})</p>
          <button onClick={load} style={{background:'none',border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:'pointer',padding:'4px 10px',fontSize:12}}>↻ Refresh</button>
        </div>
        {loading&&<div style={{padding:24,textAlign:'center'}}><div style={{width:24,height:24,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto'}}/></div>}
        {!loading&&alerts.length===0&&<p style={{padding:24,color:t.muted,textAlign:'center'}}>No alerts set yet. Create one above!</p>}
        {!loading&&alerts.map(a=>(
          <div key={a.id} style={{padding:'14px 22px',borderBottom:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',opacity:a.triggered?0.5:1}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{fontSize:16}}>{a.market==='crypto'?'🪙':'🇮🇳'}</span>
                <span style={{fontWeight:800,color:t.text,fontSize:15}}>{a.symbol}</span>
                <span style={{background:a.condition==='above'?t.green+'22':t.red+'22',color:a.condition==='above'?t.green:t.red,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>
                  {a.condition==='above'?'↑ Above':'↓ Below'} {a.market==='crypto'?'$':'₹'}{parseFloat(a.target_price).toLocaleString()}
                </span>
                {a.triggered&&<span style={{background:t.muted+'22',color:t.muted,borderRadius:20,padding:'2px 8px',fontSize:10}}>TRIGGERED</span>}
              </div>
              {a.note&&<p style={{color:t.muted,fontSize:12}}>{a.note}</p>}
            </div>
            <button onClick={()=>remove(a.id)} style={{background:t.red+'11',border:`1px solid ${t.red}33`,borderRadius:8,color:t.red,cursor:'pointer',padding:'5px 12px',fontSize:12,fontWeight:600}}>✕ Remove</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Performance Tab — Strategy Stats ──────────────────────────
function PerformanceTab({t, setTab}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{load()},[])

  async function load(){
    setLoading(true)
    try{const r=await fetch('/api/strategy-performance');const d=await r.json();setData(d)}catch{}
    setLoading(false)
  }

  const fmtPnl = (n) => {
    const v = parseFloat(n||0)
    return <span style={{color:v>0?t.green:v<0?t.red:t.muted,fontWeight:700,fontFamily:'monospace'}}>{v>0?'+':''}{v.toFixed(2)}</span>
  }

  return (
    <div>
      <div style={{marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Strategy Performance</h2>
          <p style={{color:t.muted,fontSize:13,marginTop:5}}>Win rates and P&L per strategy — based on your closed trades</p>
        </div>
        <button onClick={()=>setTab('backtest')}
          style={{padding:'9px 18px',background:'linear-gradient(135deg,#ff6600,#ff9500)',border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:13,boxShadow:'0 4px 14px #ff660033',flexShrink:0}}>
          🔬 Run Backtest →
        </button>
      </div>

      {loading&&<div style={{textAlign:'center',padding:40}}><div style={{width:32,height:32,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/><p style={{color:t.muted}}>Calculating performance...</p></div>}

      {!loading&&data&&(
        <>
          {/* Overall stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:24}}>
            {[
              {l:'TOTAL TRADES', v:data.overall.totalTrades, c:t.text},
              {l:'WIN RATE',     v:`${data.overall.winRate}%`, c:data.overall.winRate>50?t.green:t.red},
              {l:'TOTAL P&L',   v:`₹${data.overall.totalPnl}`, c:data.overall.totalPnl>0?t.green:t.red},
              {l:'AVG P&L',     v:`₹${data.overall.avgPnl}`, c:data.overall.avgPnl>0?t.green:t.red},
            ].map(x=>(
              <div key={x.l} style={{background:t.card,borderRadius:14,padding:'16px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:6}}>{x.l}</p>
                <p style={{color:x.c,fontSize:20,fontWeight:900,fontFamily:'monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          {/* By strategy */}
          {data.byStrategy.length > 0 ? (
            <div style={{background:t.card,borderRadius:20,border:`1px solid ${t.border}`,overflow:'hidden'}}>
              <div style={{padding:'16px 22px',borderBottom:`1px solid ${t.border}`}}>
                <p style={{fontWeight:700,color:t.text}}>By Strategy</p>
              </div>
              {data.byStrategy.map(s=>(
                <div key={s.strategy} style={{padding:'16px 22px',borderBottom:`1px solid ${t.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:10}}>
                    <div>
                      <p style={{fontWeight:700,color:t.text,marginBottom:4}}>{s.strategy}</p>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <span style={{color:t.muted,fontSize:12}}>{s.trades} trades</span>
                        <span style={{color:t.green,fontSize:12,fontWeight:600}}>{s.wins}W</span>
                        <span style={{color:t.red,fontSize:12,fontWeight:600}}>{s.losses}L</span>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
                      <div style={{textAlign:'right'}}>
                        <p style={{color:t.muted,fontSize:10,fontWeight:600}}>WIN RATE</p>
                        <p style={{color:s.winRate>50?t.green:t.red,fontWeight:800,fontSize:18}}>{s.winRate}%</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{color:t.muted,fontSize:10,fontWeight:600}}>TOTAL P&L</p>
                        <p style={{fontWeight:800,fontSize:16}}>{fmtPnl(s.totalPnl)}</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{color:t.muted,fontSize:10,fontWeight:600}}>AVG/TRADE</p>
                        <p style={{fontWeight:700,fontSize:14}}>{fmtPnl(s.avgPnl)}</p>
                      </div>
                    </div>
                  </div>
                  {/* Win rate bar */}
                  <div style={{marginTop:10,height:5,background:t.surface,borderRadius:3,overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${s.winRate}%`,background:s.winRate>60?t.green:s.winRate>40?t.amber:t.red,borderRadius:3,transition:'width 0.5s'}}/>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{background:t.card,borderRadius:20,padding:40,border:`1px solid ${t.border}`,textAlign:'center'}}>
              <p style={{fontSize:32,marginBottom:12}}>📊</p>
              <p style={{color:t.text,fontWeight:700,fontSize:16,marginBottom:8}}>No closed trades yet</p>
              <p style={{color:t.muted,fontSize:13}}>Execute and close trades to see strategy performance stats here.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── Morning Brief Tab ──────────────────────────────────────────
function MorningBriefTab({t}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Load on mount - will return cached version instantly if available
  useEffect(() => { load(false) }, [])

  async function load(force=false) {
    setLoading(true); setError('')
    try {
      const url = force ? '/api/morning-intelligence?force=1' : '/api/morning-intelligence'
      const r = await fetch(url)
      const d = await r.json()
      if (d.status === 'success') setData(d)
      else setError(d.error || 'Failed to load brief')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const fmtNum = (x, curr='') => x?.price != null
    ? `${curr}${parseFloat(x.price).toLocaleString('en-IN',{maximumFractionDigits:2})} (${x.pct>=0?'+':''}${x.pct}%)`
    : 'N/A'

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',
        marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>☀️ Morning Brief</h2>
          <p style={{color:t.muted,fontSize:13,marginTop:4}}>
            {data ? (
              data.cached
                ? `Today's brief · Generated ${new Date(data.generatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST · Cached`
                : `${data.day}, ${data.date} · Generated ${new Date(data.generatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST · Fresh`
            ) : 'AI-powered daily market intelligence'}
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {/* Only show regenerate button - not auto-refresh */}
          <button onClick={() => load(false)} disabled={loading}
            style={{padding:'7px 14px',background:t.surface,border:`1px solid ${t.border}`,
              borderRadius:10,color:t.muted,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif',
              opacity:loading?0.6:1}}>
            {loading ? '⏳' : '↻ Reload'}
          </button>
          <button onClick={() => load(true)} disabled={loading}
            style={{padding:'7px 14px',background:t.accentC,border:'none',
              borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:12,
              fontFamily:'Inter,sans-serif',opacity:loading?0.6:1}}>
            {loading ? '⏳ Generating...' : '⚡ New Brief'}
          </button>
        </div>
      </div>

      {/* Note about caching */}
      {data?.cached && (
        <div style={{background:t.green+'11',border:`1px solid ${t.green}22`,borderRadius:10,
          padding:'8px 14px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:16}}>✅</span>
          <p style={{color:t.green,fontSize:12,fontWeight:600}}>
            Cached brief — no API call made. Tap "New Brief" to regenerate (uses Claude API).
          </p>
        </div>
      )}

      {loading && !data && (
        <div style={{textAlign:'center',padding:60}}>
          <div style={{width:36,height:36,border:`3px solid ${t.border}`,borderTopColor:t.accentC,
            borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
          <p style={{color:t.muted,fontSize:14}}>Analysing global markets with Claude AI...</p>
          <p style={{color:t.muted,fontSize:12,marginTop:6}}>This may take 15-20 seconds</p>
        </div>
      )}

      {error && (
        <div style={{background:t.red+'11',border:`1px solid ${t.red}33`,borderRadius:14,
          padding:24,textAlign:'center'}}>
          <p style={{color:t.red,fontWeight:700,marginBottom:8}}>Failed to load</p>
          <p style={{color:t.muted,fontSize:13}}>{error}</p>
          <button onClick={() => load(false)} style={{marginTop:12,padding:'8px 20px',
            background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,
            color:t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>Try Again</button>
        </div>
      )}

      {!loading && data && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Global snapshot cards */}
          {data.rawData && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8,marginBottom:4}}>
              {[
                {l:'S&P 500',    v:fmtNum(data.rawData.us?.sp500)},
                {l:'NASDAQ',     v:fmtNum(data.rawData.us?.nasdaq)},
                {l:'VIX',        v:data.rawData.us?.vix?.price||'N/A',
                  c:data.rawData.us?.vix?.price>25?t.red:data.rawData.us?.vix?.price>20?t.amber:t.green},
                {l:'NIFTY',      v:fmtNum(data.rawData.india?.nifty,'₹')},
                {l:'BANKNIFTY',  v:fmtNum(data.rawData.india?.banknifty,'₹')},
                {l:'CRUDE WTI',  v:fmtNum(data.rawData.commodities?.crude,'$')},
                {l:'GOLD',       v:fmtNum(data.rawData.commodities?.gold,'$')},
                {l:'USD/INR',    v:fmtNum(data.rawData.india?.usdinr)},
                {l:'BTC',        v:fmtNum(data.rawData.crypto?.btc,'$')},
                {l:'FEAR/GREED', v:`${data.rawData.fearGreed?.value||'N/A'}/100`,
                  c:data.rawData.fearGreed?.value<30?t.red:data.rawData.fearGreed?.value>70?t.green:t.amber},
              ].map(x=>(
                <div key={x.l} style={{background:t.card,borderRadius:10,padding:'10px 12px',
                  border:`1px solid ${t.border}`}}>
                  <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.06em',marginBottom:3}}>{x.l}</p>
                  <p style={{color:x.c||t.text,fontSize:11,fontWeight:700,
                    fontFamily:'JetBrains Mono,monospace',lineHeight:1.2}}>{x.v}</p>
                </div>
              ))}
            </div>
          )}

          {/* India Brief */}
          <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`,
              display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>🇮🇳</span>
              <span style={{fontWeight:700,color:t.text,fontSize:14}}>
                Indian Markets — NIFTY · BANKNIFTY · FINNIFTY
              </span>
            </div>
            <div style={{padding:'16px',whiteSpace:'pre-wrap',color:t.text2,
              fontSize:13,lineHeight:1.8,fontFamily:'Inter,sans-serif'}}>
              {data.indiaBrief}
            </div>
          </div>

          {/* Crypto Brief */}
          <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`,
              display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>🪙</span>
              <span style={{fontWeight:700,color:t.text,fontSize:14}}>
                Crypto — BTC · ETH · SOL · XRP
              </span>
            </div>
            <div style={{padding:'16px',whiteSpace:'pre-wrap',color:t.text2,
              fontSize:13,lineHeight:1.8,fontFamily:'Inter,sans-serif'}}>
              {data.cryptoBrief}
            </div>
          </div>

          {/* Top News */}
          {data.topNews?.length > 0 && (
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`}}>
                <span style={{fontWeight:700,color:t.text,fontSize:13}}>📰 MARKET NEWS</span>
              </div>
              <div style={{padding:'4px 0'}}>
                {data.topNews.map((n,i)=>(
                  <div key={i} style={{padding:'8px 16px',
                    borderBottom:i<data.topNews.length-1?`1px solid ${t.border}22`:'none',
                    display:'flex',gap:10,alignItems:'flex-start'}}>
                    <span style={{color:t.muted,fontSize:10,flexShrink:0,marginTop:2,
                      minWidth:36}}>{n.timeAgo}</span>
                    <p style={{color:t.text2,fontSize:12,lineHeight:1.5}}>{n.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Live Prices Ticker ─────────────────────────────────────────
// Shows all 7 instruments updating every 2 seconds
function LiveTicker({prices, kiteLoggedIn, market, t, setTab}) {
  const INDIA  = ['NIFTY','BANKNIFTY','FINNIFTY']
  const CRYPTO = ['BTC','ETH','SOL','XRP']

  const PriceItem = ({sym, data, curr, onClick}) => {
    const up   = (data?.changePct || 0) >= 0
    const pct  = data?.changePct
    return (
      <div onClick={onClick} style={{display:'flex',flexDirection:'column',gap:2,flexShrink:0,cursor:'pointer',
        padding:'6px 12px',borderRadius:10,transition:'background 0.15s',minWidth:80}}
        onMouseEnter={e=>e.currentTarget.style.background=t.surface}
        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
        <span style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.06em'}}>{sym}</span>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,color:t.text,fontWeight:800,lineHeight:1}}>
          {data ? (curr === '₹' ? '₹' : '$') + parseFloat(data.price).toLocaleString('en-IN',{maximumFractionDigits:curr==='₹'?0:2}) : '—'}
        </span>
        {data && pct != null && (
          <span style={{fontSize:10,fontWeight:700,color:up?t.green:t.red}}>
            {up?'+':''}{parseFloat(pct).toFixed(2)}%
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{background:t.tickBg,borderBottom:`1px solid ${t.border}`,padding:'4px 16px',
      display:'flex',gap:2,overflowX:'auto',alignItems:'center',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
      {/* Divider */}
      <span style={{color:t.muted,fontSize:10,fontWeight:600,marginRight:4,flexShrink:0}}>🇮🇳</span>
      {INDIA.map(sym => (
        <PriceItem key={sym} sym={sym} data={prices.india?.[sym]} curr='₹'
          onClick={() => setTab('india')} />
      ))}
      <div style={{width:1,height:30,background:t.border,flexShrink:0,margin:'0 8px'}}/>
      <span style={{color:t.muted,fontSize:10,fontWeight:600,marginRight:4,flexShrink:0}}>🪙</span>
      {CRYPTO.map(sym => (
        <PriceItem key={sym} sym={sym} data={prices.crypto?.[sym]} curr='$'
          onClick={() => setTab('crypto')} />
      ))}
      <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0,padding:'0 8px'}}>
        <span style={{width:6,height:6,borderRadius:'50%',
          background:market?.isOpen ? t.green : t.amber,
          animation:market?.isOpen ? 'pulse 1.5s infinite' : 'none',
          display:'inline-block'}}/>
        <span style={{fontSize:10,color:t.muted,whiteSpace:'nowrap'}}>
          {market?.isOpen ? `Market Open · ${market.timeIST}` :
           market?.isPreMarket ? 'Pre-Market' :
           market?.isPostMarket ? 'Post-Market' : 'Market Closed'}
        </span>
        {!kiteLoggedIn && (
          <span style={{fontSize:10,color:t.amber,background:t.amber+'18',
            padding:'1px 6px',borderRadius:6,fontWeight:600}}>
            ⚡ Login for live India
          </span>
        )}
      </div>
    </div>
  )
}

// ── India Tab ──────────────────────────────────────────────────
// NIFTY, BANKNIFTY, FINNIFTY — charts + option chain
function IndiaTab({t, at, prices}) {
  const [sym,    setSym]    = useState('NIFTY')
  const [view,   setView]   = useState('chart') // chart | options

  const indiaSyms = ['NIFTY','BANKNIFTY','FINNIFTY']
  const data = prices.india?.[sym]

  return (
    <div>
      {/* Header with symbol selector */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',gap:8}}>
          {indiaSyms.map(s => (
            <button key={s} onClick={() => setSym(s)}
              style={{padding:'7px 12px',borderRadius:10,border:`1px solid ${sym===s?t.accentC:t.border}`,
                background:sym===s?t.accentC+'22':t.surface,
                color:sym===s?t.accentC:t.muted,
                fontWeight:700,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {s}
            </button>
          ))}
        </div>
        <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
          {[['chart','📈 Chart'],['options','⛓ Options']].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{padding:'5px 14px',borderRadius:16,border:'none',
                background:view===v?t.accentC+'22':'transparent',
                color:view===v?t.accentC:t.muted,
                fontWeight:view===v?700:400,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Live price for selected instrument */}
      {data && (
        <div style={{background:t.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,marginBottom:16,
          display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
          <div>
            <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.06em'}}>{sym}</p>
            <p style={{fontFamily:'JetBrains Mono,monospace',fontSize:24,fontWeight:900,color:t.text,lineHeight:1}}>
              ₹{parseFloat(data.price).toLocaleString('en-IN',{maximumFractionDigits:0})}
            </p>
          </div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            {[
              {l:'Change', v:`${(data.changePct||0)>=0?'+':''}${parseFloat(data.changePct||0).toFixed(2)}%`, c:(data.changePct||0)>=0?t.green:t.red},
              {l:'Open',   v:`₹${parseFloat(data.open||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`, c:t.text},
              {l:'High',   v:`₹${parseFloat(data.high||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`, c:t.green},
              {l:'Low',    v:`₹${parseFloat(data.low||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`,  c:t.red},
              {l:'Volume', v:data.volume ? (data.volume > 1000000 ? (data.volume/1000000).toFixed(1)+'M' : (data.volume/1000).toFixed(0)+'K') : '—', c:t.muted},
            ].map(x => (
              <div key={x.l}>
                <p style={{color:t.muted,fontSize:9,fontWeight:600,letterSpacing:'0.05em'}}>{x.l}</p>
                <p style={{color:x.c,fontSize:13,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>
          <div style={{marginLeft:'auto',fontSize:10,color:t.muted}}>
            {data.source === 'kite' ? '🟢 Live · Kite' : '⚪ Yahoo Finance'}
          </div>
        </div>
      )}

      {view === 'chart' && <PZChart symbol={sym} t={t} h={480} accessToken={at} />}
      {view === 'options' && <OptionsTab t={t} defaultSymbol={sym} />}
    </div>
  )
}

// ── Crypto Live Tab ────────────────────────────────────────────
// BTC, ETH, SOL, XRP — live prices + charts
function CryptoLiveTab({t, prices}) {
  const [sym, setSym] = useState('BTC')
  const SYMS = ['BTC','ETH','SOL','XRP']
  const data = prices.crypto?.[sym]

  return (
    <div>
      {/* Symbol selector */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {SYMS.map(s => {
          const d = prices.crypto?.[s]
          const up = (d?.changePct || 0) >= 0
          return (
            <button key={s} onClick={() => setSym(s)}
              style={{padding:'8px 16px',borderRadius:10,
                border:`1px solid ${sym===s?t.accentC:t.border}`,
                background:sym===s?t.accentC+'22':t.surface,
                cursor:'pointer',fontFamily:'Inter,sans-serif',textAlign:'left'}}>
              <p style={{color:sym===s?t.accentC:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.04em'}}>{s}</p>
              {d && (
                <>
                  <p style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,fontWeight:800,color:t.text,lineHeight:1.2}}>
                    ${parseFloat(d.price).toLocaleString('en-IN',{maximumFractionDigits:s==='BTC'?0:2})}
                  </p>
                  <p style={{fontSize:10,fontWeight:700,color:up?t.green:t.red}}>
                    {up?'+':''}{parseFloat(d.changePct||0).toFixed(2)}%
                  </p>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Live stats for selected */}
      {data && (
        <div style={{background:t.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,marginBottom:16,
          display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
          <div>
            <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.06em'}}>{sym}/USD · Delta Perpetual</p>
            <p style={{fontFamily:'JetBrains Mono,monospace',fontSize:24,fontWeight:900,color:t.text,lineHeight:1}}>
              ${parseFloat(data.price).toLocaleString('en-IN',{maximumFractionDigits:sym==='BTC'?0:2})}
            </p>
          </div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            {[
              {l:'24h Change', v:`${(data.changePct||0)>=0?'+':''}${parseFloat(data.changePct||0).toFixed(2)}%`, c:(data.changePct||0)>=0?t.green:t.red},
              {l:'High',       v:`$${parseFloat(data.high||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`, c:t.green},
              {l:'Low',        v:`$${parseFloat(data.low||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`,  c:t.red},
              {l:'Volume',     v:data.volume ? parseFloat(data.volume).toFixed(0) : '—', c:t.muted},
              {l:'OI (USD)',   v:data.oi ? '$'+parseFloat(data.oi/1000000).toFixed(1)+'M' : '—', c:t.muted},
              {l:'Funding',    v:data.fundingRate ? (parseFloat(data.fundingRate)*100).toFixed(4)+'%' : '—',
               c:parseFloat(data.fundingRate||0)>0?t.green:parseFloat(data.fundingRate||0)<0?t.red:t.muted},
            ].map(x => (
              <div key={x.l}>
                <p style={{color:t.muted,fontSize:9,fontWeight:600,letterSpacing:'0.05em'}}>{x.l}</p>
                <p style={{color:x.c,fontSize:13,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>
          <div style={{marginLeft:'auto',fontSize:10,color:t.muted}}>🟢 Live · Delta Exchange</div>
        </div>
      )}

      {/* Chart via Delta candles */}
      <PZChart symbol={sym} t={t} h={480} accessToken={null} market='crypto' />
    </div>
  )
}

// ── New TickerBar (updated for live-prices API) ─────────────────
function TickerBar({prices, kiteLoggedIn, market, t, setTab}) {
  return <LiveTicker prices={prices} kiteLoggedIn={kiteLoggedIn} market={market} t={t} setTab={setTab} />
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [dark,     setDark]   = useState(true)
  const [at,       setAt]     = useState('')
  const [kiteUser, setKU]     = useState(null)
  const [tab,      setTab]    = useState('morning')
  const [time,     setTime]   = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [prices,   setPrices] = useState({ india: {}, crypto: {} })
  const [market,   setMarket] = useState({})
  const [kiteLoggedIn, setKiteLoggedIn] = useState(false)
  const [tr,       setTr]     = useState(0) // refresh trigger
  const [showManual,   setShowManual]   = useState(false)
  const [manForm,      setManForm]      = useState({
    symbol:'NIFTY',direction:'BUY',quantity:1,entry_price:'',
    stop_loss:'',target:'',strategy:'Manual',notes:'',market:'india'
  })

  const t = dark ? DARK : LIGHT

  // Boot — auth check, kite token, login URL, clock
  useEffect(() => {
    if (!localStorage.getItem('pz_token')) { router.push('/'); return }
    const sd = localStorage.getItem('pz_dark')
    if (sd !== null) setDark(sd === 'true')

    const a = localStorage.getItem('kite_access_token')
    const u = localStorage.getItem('kite_user')
    const d = localStorage.getItem('kite_connected_date')
    if (a && d === new Date().toDateString()) {
      setAt(a)
      setKiteLoggedIn(true)
      if (u) setKU(JSON.parse(u))
    } else {
      ['kite_access_token','kite_user','kite_connected_date'].forEach(k => localStorage.removeItem(k))
    }

    fetch('/api/kite-login').then(r => r.json()).then(d => setLoginUrl(d.loginUrl)).catch(() => {})

    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', { hour12:true, timeZone:'Asia/Kolkata' }) + ' IST')
    tick()
    const ti = setInterval(tick, 1000)
    return () => clearInterval(ti)
  }, [])

  // Live prices — 2 second refresh
  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 2000)
    return () => clearInterval(iv)
  }, [at])

  async function fetchPrices() {
    try {
      const headers = at ? { 'x-kite-access-token': at } : {}
      const r = await fetch('/api/live-prices', { headers })
      const d = await r.json()
      if (d.status === 'success') {
        setPrices({ india: d.india || {}, crypto: d.crypto || {} })
        setMarket(d.market || {})
        setKiteLoggedIn(d.kiteLoggedIn)
      }
    } catch {}
  }

  function toggleDark() { const nd = !dark; setDark(nd); localStorage.setItem('pz_dark', String(nd)) }
  function disconnect() {
    ['kite_access_token','kite_user','kite_connected_date'].forEach(k => localStorage.removeItem(k))
    setAt(''); setKU(null); setKiteLoggedIn(false)
  }

  const tabs = [
    { id:'morning',  l:'☀️ Brief'    },
    { id:'india',    l:'🇮🇳 India'   },
    { id:'crypto',   l:'🪙 Crypto'   },
    { id:'paper',    l:'🧪 Paper'    },
    { id:'portfolio',l:'💼 Portfolio'},
    { id:'trades',   l:'📋 History'  },
    { id:'watchlist',l:'👁 Watchlist'},
    { id:'alerts',   l:'🔔 Alerts'   },
    { id:'backtest', l:'🔬 Backtest' },
  ]

  return (
    <>
      <Head>
        <title>Projectzero — Live Trading</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <meta name="theme-color" content="#080c14"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:t.bg,fontFamily:'Inter,sans-serif',color:t.text,transition:'background 0.3s'}}>
        {dark && (
          <>
            <div style={{position:'fixed',top:-150,left:-150,width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(59,158,255,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/>
            <div style={{position:'fixed',bottom:-150,right:-150,width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(167,139,250,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/>
          </>
        )}

        {/* Header */}
        <header style={{background:dark?'rgba(8,12,20,0.95)':'rgba(255,255,255,0.97)',
          borderBottom:`1px solid ${t.border}`,padding:'0 20px',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          minHeight:52,position:'sticky',top:0,zIndex:100,
          backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:'linear-gradient(135deg,#ff7a00,#ffaa00)',
              display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:14,color:'#fff'}}>P</div>
            <span style={{fontWeight:800,fontSize:15,color:t.text}}>Projectzero</span>
            <span style={{fontSize:10,background:t.accentC+'22',color:t.accentC,padding:'2px 8px',borderRadius:20,fontWeight:700,letterSpacing:'0.05em'}}>BETA</span>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:11,color:t.muted,fontFamily:'JetBrains Mono,monospace'}}>{time}</span>
            {!kiteLoggedIn ? (
              <button onClick={() => loginUrl && window.location.assign(loginUrl)}
                style={{padding:'6px 14px',background:`linear-gradient(135deg,${t.green},${t.teal})`,
                  border:'none',borderRadius:8,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif'}}>
                Connect Zerodha
              </button>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:t.green,fontWeight:600}}>
                  🟢 {kiteUser?.user_name || 'Zerodha'}
                </span>
                <button onClick={disconnect}
                  style={{padding:'4px 10px',background:'none',border:`1px solid ${t.border}`,
                    borderRadius:6,color:t.muted,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
                  Disconnect
                </button>
              </div>
            )}
            <button onClick={toggleDark}
              style={{padding:'4px 8px',background:'none',border:`1px solid ${t.border}`,
                borderRadius:6,color:t.muted,cursor:'pointer',fontSize:14}}>
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Live ticker */}
        <LiveTicker prices={prices} kiteLoggedIn={kiteLoggedIn} market={market} t={t} setTab={setTab} />

        {/* Tab bar */}
        <div style={{background:t.surface,borderBottom:`1px solid ${t.border}`,
          padding:'0 20px',display:'flex',gap:0,overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              style={{padding:'10px 10px',background:'none',border:'none',
                borderBottom:tab===tb.id?`2px solid ${t.accentC}`:'2px solid transparent',
                color:tab===tb.id?t.accentC:t.muted,
                fontWeight:tab===tb.id?700:500,fontSize:12,
                cursor:'pointer',fontFamily:'Inter,sans-serif',
                whiteSpace:'nowrap',flexShrink:0,transition:'color 0.15s'}}>
              {tb.l}
            </button>
          ))}
        </div>

        {/* Content */}
        <main style={{maxWidth:1400,margin:'0 auto',padding:'16px 12px',position:'relative',zIndex:1}}>
          {tab==='morning'   && <MorningBriefTab t={t} />}
          {tab==='india'     && <IndiaTab t={t} at={at} prices={prices} />}
          {tab==='crypto'    && <CryptoLiveTab t={t} prices={prices} />}
          {tab==='paper'     && <PaperTradesTab t={t} />}
          {tab==='portfolio' && (
            <div style={{display:'flex',flexDirection:'column',gap:24}}>
              {/* Kite — Live positions, funds, orders */}
              {at && (
                <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid ${t.border}`}}>
                  <p style={{fontWeight:800,fontSize:15,color:t.text,marginBottom:16}}>🇮🇳 Zerodha — Live Portfolio</p>
                  <Positions at={at} t={t} />
                </div>
              )}
              {!at && (
                <div style={{background:t.card,borderRadius:16,padding:32,border:`1px solid ${t.border}`,textAlign:'center'}}>
                  <p style={{fontSize:36,marginBottom:8}}>🇮🇳</p>
                  <p style={{color:t.text,fontWeight:700,marginBottom:6}}>Zerodha not connected</p>
                  <p style={{color:t.muted,fontSize:13}}>Login with Zerodha to see live positions, funds and orders</p>
                </div>
              )}
              {/* Delta Exchange wallet */}
              <DeltaPortfolioPanel t={t} />
              {/* Binance portfolio */}
              <BinancePortfolio t={t} />
              {/* Kite today's trades */}
              {at && <KiteTradesPanel at={at} t={t} />}
            </div>
          )}
          {tab==='trades' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}>
                <div>
                  <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Trade History</h2>
                  <p style={{color:t.muted,fontSize:13,marginTop:5}}>All trades · Entry/Exit · P&L</p>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => setTr(r => r+1)}
                    style={{padding:'8px 16px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif',fontWeight:600}}>
                    🔄 Refresh
                  </button>
                  <button onClick={() => setShowManual(v => !v)}
                    style={{padding:'8px 16px',background:'#ff660018',border:'1px solid #ff660044',borderRadius:10,color:'#ff6600',cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif',fontWeight:700}}>
                    + Log Trade
                  </button>
                </div>
              </div>
              {showManual && <ManualTradeForm t={t} onSave={() => { setShowManual(false); setTr(r => r+1) }} onClose={() => setShowManual(false)} manForm={manForm} setManForm={setManForm}/>}
              <History refresh={tr} t={t} />
            </div>
          )}
          {tab==='watchlist' && <WatchlistTab t={t} at={at} />}
          {tab==='alerts'    && <AlertsTab t={t} />}
          {tab==='backtest'  && <BacktestTab t={t} />}
        </main>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 4px; height: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #2a3545; border-radius: 3px }
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { -webkit-text-size-adjust: 100%; }
        button { -webkit-tap-highlight-color: transparent; }
        @media (max-width: 480px) {
          .pz-hide-mobile { display: none !important; }
          .pz-stack-mobile { flex-direction: column !important; }
        }
      `}</style>
    </>
  )
}
