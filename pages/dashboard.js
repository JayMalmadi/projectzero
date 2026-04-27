import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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

const PZ_STRATEGIES = [
  {id:'pz-orb',     name:'PZ-ORB Filter',    emoji:'◎',  desc:'76% success. Gap+volume filter. Best on Tue/Wed.',   symbols:['NIFTY','BANKNIFTY'],           type:'Intraday'},
  {id:'pz-tuesday', name:'Tuesday Momentum', emoji:'📅', desc:'Tue avg +0.97% BankNifty. Only fires Tue/Wed.',      symbols:['NIFTY','BANKNIFTY'],           type:'Intraday'},
  {id:'pz-gap-fade',name:'Gap and Fade',      emoji:'〰', desc:'24 gap events in 3 months. Fades gaps >0.35%.',      symbols:['NIFTY','BANKNIFTY'],           type:'Intraday'},
  {id:'pz-swing',   name:'Weak Stock Swing', emoji:'📊', desc:'IT sector weak. Short bounces to EMA21.',            symbols:['TCS','INFY','ICICIBANK'],      type:'Swing'},
  {id:'supertrend', name:'Supertrend',        emoji:'🔺', desc:'ATR-based trend filter. Rides momentum both ways.',  symbols:['NIFTY','BANKNIFTY','RELIANCE'],type:'Intraday'},
  {id:'vwap',       name:'VWAP Reversion',   emoji:'〽', desc:'Trade with or against VWAP. Best intraday anchor.',  symbols:['NIFTY','BANKNIFTY','HDFCBANK'],type:'Intraday'},
  {id:'bollinger',  name:'Bollinger Bands',   emoji:'🎯', desc:'Squeeze breakouts and mean reversion near bands.',   symbols:['NIFTY','BANKNIFTY','SBIN'],    type:'Intraday'},
  {id:'macd',       name:'MACD Crossover',    emoji:'📈', desc:'Classic MACD signal with EMA confirmation filter.',  symbols:['NIFTY','BANKNIFTY','TCS'],     type:'Intraday'},
]

const DARK = {
  bg:'#07090f', surface:'#0d1117', card:'#111827', border:'#1f2937', border2:'#374151',
  text:'#f9fafb', text2:'#9ca3af', muted:'#4b5563',
  green:'#10f59e', red:'#ff4466', blue:'#3b9eff', amber:'#fbbf24', purple:'#a78bfa', teal:'#2dd4bf',
  accent:'linear-gradient(135deg,#3b9eff,#a78bfa)', accentC:'#3b9eff',
  glow:'0 0 0 1px #1f2937,0 4px 24px rgba(0,0,0,0.5)', tickBg:'#060c18',
}
const LIGHT = {
  bg:'#f0f4ff', surface:'#ffffff', card:'#ffffff', border:'#e5e7eb', border2:'#d1d5db',
  text:'#111827', text2:'#6b7280', muted:'#9ca3af',
  green:'#059669', red:'#dc2626', blue:'#2563eb', amber:'#d97706', purple:'#7c3aed', teal:'#0d9488',
  accent:'linear-gradient(135deg,#2563eb,#7c3aed)', accentC:'#2563eb',
  glow:'0 1px 3px rgba(0,0,0,0.1),0 4px 16px rgba(0,0,0,0.06)', tickBg:'#e8eeff',
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

function PZChart({symbol, t, h=420, accessToken}) {
  const INTERVALS = [
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
  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [source,  setSource]  = useState('')
  const [intv,    setIntv]    = useState('15minute')
  const [last,    setLast]    = useState(null)
  const [live,    setLive]    = useState(true)
  const [updated, setUpdated] = useState(null)
  const chartRef = useRef(null)
  const tvRef    = useRef(null)
  const serRef   = useRef(null)
  const volRef   = useRef(null)
  const timerRef = useRef(null)
  const cfg = INTERVALS.find(i=>i.v===intv)||INTERVALS[4]

  async function loadData(silent=false) {
    if (!silent) setLoading(true)
    try {
      const r = await fetch(`/api/kite-chart?symbol=${symbol}&interval=${intv}&days=${cfg.days}`,
        {headers:accessToken?{'x-kite-access-token':accessToken}:{}})
      const d = await r.json()
      if (d.candles?.length>0) {
        setCandles(d.candles)
        setSource(d.source)
        setLast(d.last)
        setUpdated(new Date())
        if (silent && serRef.current) {
          const s=[...d.candles].sort((a,b)=>a.time-b.time)
          const u=s.filter((c,i)=>i===0||c.time!==s[i-1].time)
          serRef.current.setData(u)
          if (volRef.current) volRef.current.setData(u.map(c=>({time:c.time,value:c.volume||0,color:c.close>=c.open?'#10f59e33':'#ff446633'})))
        }
      }
    } catch {}
    if (!silent) setLoading(false)
  }

  useEffect(()=>{
    loadData()
    if (timerRef.current) clearInterval(timerRef.current)
    if (live) timerRef.current=setInterval(()=>loadData(true), cfg.refresh*1000)
    return ()=>{ if (timerRef.current) clearInterval(timerRef.current) }
  },[symbol,intv,accessToken,live])

  useEffect(()=>{
    if (!candles.length||!chartRef.current||loading) return
    if (!window.LightweightCharts) {
      const s=document.createElement('script')
      s.src='https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
      s.onload=()=>renderChart()
      document.head.appendChild(s)
    } else { renderChart() }
  },[candles,t])

  function renderChart() {
    if (!window.LightweightCharts||!chartRef.current) return
    if (tvRef.current) { try{tvRef.current.remove()}catch{} tvRef.current=null }
    chartRef.current.innerHTML=''
    const isDark=t.bg==='#07090f'
    const chart=window.LightweightCharts.createChart(chartRef.current,{
      width:chartRef.current.clientWidth||600, height:h-90,
      layout:{background:{color:isDark?'#0d1117':'#ffffff'},textColor:isDark?'#9ca3af':'#6b7280',fontSize:11},
      grid:{vertLines:{color:isDark?'#1f293755':'#f3f4f6'},horzLines:{color:isDark?'#1f293755':'#f3f4f6'}},
      crosshair:{mode:1},
      rightPriceScale:{borderColor:isDark?'#1f2937':'#e5e7eb',scaleMargins:{top:0.08,bottom:0.22}},
      timeScale:{borderColor:isDark?'#1f2937':'#e5e7eb',timeVisible:true,secondsVisible:intv==='minute'},
    })
    const series=chart.addCandlestickSeries({
      upColor:'#10f59e',downColor:'#ff4466',
      borderUpColor:'#10f59e',borderDownColor:'#ff4466',
      wickUpColor:'#10f59e88',wickDownColor:'#ff446688',
    })
    const vol=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol'})
    chart.priceScale('vol').applyOptions({scaleMargins:{top:0.85,bottom:0}})
    const sorted=[...candles].sort((a,b)=>a.time-b.time)
    const deduped=sorted.filter((c,i)=>i===0||c.time!==sorted[i-1].time)
    series.setData(deduped)
    vol.setData(deduped.map(c=>({time:c.time,value:c.volume||0,color:c.close>=c.open?'#10f59e33':'#ff446633'})))
    chart.timeScale().fitContent()
    tvRef.current=chart; serRef.current=series; volRef.current=vol
    const ro=new ResizeObserver(()=>{if(chartRef.current)chart.applyOptions({width:chartRef.current.clientWidth})})
    ro.observe(chartRef.current)
  }

  const chg    = last ? ((last.close-last.open)/last.open*100) : 0
  const isUp   = chg >= 0
  const secAgo = updated ? Math.round((new Date()-updated)/1000) : null

  return (
    <div style={{borderRadius:16,overflow:'hidden',border:`1px solid ${t.border}`,background:t.card}}>
      {/* Row 1: symbol + price + controls */}
      <div style={{padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${t.border}`}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:live?t.green:t.amber,display:'inline-block',animation:live?'pulse 1.5s infinite':'none'}} />
          <span style={{color:t.text,fontWeight:800,fontSize:15}}>{symbol}</span>
          {last && <>
            <span style={{color:t.text,fontSize:14,fontFamily:'JetBrains Mono,monospace',fontWeight:700}}>₹{fmt(last.close)}</span>
            <span style={{fontSize:11,fontWeight:700,color:isUp?t.green:t.red,background:(isUp?t.green:t.red)+'18',borderRadius:5,padding:'2px 7px'}}>{isUp?'+':''}{fmt(chg,2)}{'%'}</span>
          </>}
          <span style={{color:t.muted,fontSize:10}}>{source==='kite'?'🟢 Live':'⚪ Yahoo'}{secAgo!==null?` · ${secAgo}s ago`:''}</span>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setLive(v=>!v)} style={{padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:live?t.green+'22':t.surface,border:`1px solid ${live?t.green:t.border}`,color:live?t.green:t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
            {live?`⚡ Auto (${cfg.refresh}s)`:'⏸ Paused'}
          </button>
          <button onClick={()=>loadData()} style={{padding:'3px 8px',borderRadius:6,fontSize:13,background:'none',border:`1px solid ${t.border}`,color:t.muted,cursor:'pointer'}}>↻</button>
          {KITE_SEARCH[symbol]&&<button onClick={()=>window.open(`/chart?symbol=${symbol}&market=crypto`,'_blank','width=1440,height=860')} style={{padding:'3px 10px',borderRadius:6,fontSize:11,background:'none',border:`1px solid ${t.border}`,color:t.blue,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Kite ↗</button>}
        </div>
      </div>
      {/* Row 2: interval selector */}
      <div style={{padding:'8px 14px',display:'flex',gap:4,flexWrap:'wrap',borderBottom:`1px solid ${t.border}`,background:t.surface+'55'}}>
        {INTERVALS.map(i=>(
          <button key={i.v} onClick={()=>setIntv(i.v)} style={{padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:700,background:intv===i.v?t.accentC:t.surface,border:`1px solid ${intv===i.v?t.accentC:t.border}`,color:intv===i.v?'#fff':t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',transition:'all 0.1s'}}>{i.l}</button>
        ))}
      </div>
      {/* Chart */}
      {loading
        ? <div style={{height:h-90,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12}}>
            <div style={{width:36,height:36,border:`3px solid ${t.border}`,borderTopColor:t.accentC,borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
            <p style={{color:t.muted,fontSize:12}}>Loading {cfg.l} candles...</p>
          </div>
        : <div ref={chartRef} style={{width:'100%',height:h-90}} />
      }
    </div>
  )
}

// ── Execute Modal — Indian Markets (Kite) ─────────────────────
function ExecModal({data, strat, sym, at, onClose, onDone, t}) {
  const [qty,    setQty]    = useState(1)
  const [prod,   setProd]   = useState('MIS')
  const [placing,setPlacing]= useState(false)
  const [result, setResult] = useState(null)
  const [sl,     setSl]     = useState(true)
  const [tgt,    setTgt]    = useState(true)

  const risk   = data.stopLoss ? Math.abs(data.price - data.stopLoss)*qty : null
  const reward = data.target   ? Math.abs(data.target - data.price)*qty   : null
  const sc     = data.signal==='BUY' ? t.green : t.red
  const rr     = risk && reward ? (reward/risk).toFixed(1) : null
  const fmtP   = (n) => n ? `₹${Number(n).toLocaleString('en-IN',{maximumFractionDigits:2})}` : '—'

  async function place() {
    if (!at) { setResult({ok:false, msg:'Login with Zerodha first — click the Login button in header'}); return }
    setPlacing(true)
    try {
      const r = await fetch('/api/kite-pro?action=place_order', {
        method: 'POST',
        headers: {'Content-Type':'application/json', 'x-kite-access-token': at},
        body: JSON.stringify({
          tradingsymbol:   sym,
          exchange:        sym==='NIFTY'||sym==='BANKNIFTY' ? 'NSE' : 'NSE',
          transaction_type: data.signal,
          quantity:        qty,
          product:         prod,
          order_type:      'MARKET',
          stop_loss_price: sl  && data.stopLoss ? data.stopLoss : null,
          target_price:    tgt && data.target   ? data.target   : null,
        })
      })
      const d = await r.json()
      if (d.status === 'success') {
        // Save to trade history
        await fetch('/api/trades', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            symbol: sym, direction: data.signal, quantity: qty,
            entry_price: data.price, stop_loss: data.stopLoss,
            target: data.target, strategy: strat.name,
            order_id: d.results?.main_order_id,
            notes: `SL:${d.results?.sl_order_id||'—'} TGT:${d.results?.target_order_id||'—'}`
          })
        })
        setResult({ok:true, msg:d.message, det:d.results})
        onDone && onDone()
      } else {
        setResult({ok:false, msg: d.error || d.message || 'Order failed — check Kite login'})
      }
    } catch(e) { setResult({ok:false, msg:e.message}) }
    setPlacing(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:16}}>
      <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:24,padding:28,width:480,maxWidth:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:`0 0 60px ${sc}22`}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{background:sc+'22',border:`2px solid ${sc}`,borderRadius:12,padding:'8px 18px',color:sc,fontWeight:900,fontSize:20}}>{data.signal}</div>
            <div>
              <p style={{fontWeight:800,fontSize:17,color:t.text}}>{sym}</p>
              <p style={{color:t.muted,fontSize:12}}>{strat.name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.muted,cursor:'pointer',fontSize:20,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>

        {/* Price boxes */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
          {[
            {l:'ENTRY',    v:fmtP(data.price),    c:t.blue},
            {l:'STOP LOSS',v:fmtP(data.stopLoss),  c:t.red,   s:risk?`Risk ${fmtP(risk)}`:null},
            {l:'TARGET',   v:fmtP(data.target),    c:t.green,  s:reward?`Gain ${fmtP(reward)}`:null},
          ].map(x=>(
            <div key={x.l} style={{background:t.surface,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.1em',marginBottom:4}}>{x.l}</p>
              <p style={{color:x.c,fontSize:13,fontWeight:800,fontFamily:'monospace'}}>{x.v}</p>
              {x.s&&<p style={{color:t.muted,fontSize:10,marginTop:3}}>{x.s}</p>}
            </div>
          ))}
        </div>

        {/* R:R + Confidence */}
        {rr && (
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 16px',marginBottom:14,display:'flex',justifyContent:'space-around'}}>
            <div style={{textAlign:'center'}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:600}}>RISK:REWARD</p>
              <p style={{color:t.text,fontWeight:800,fontSize:16}}>1:{rr}</p>
            </div>
            <div style={{width:1,background:t.border}}/>
            <div style={{textAlign:'center'}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:600}}>CONFIDENCE</p>
              <p style={{color:data.confidence>70?t.green:data.confidence>50?t.amber:t.red,fontWeight:800,fontSize:16}}>{data.confidence}%</p>
            </div>
            <div style={{width:1,background:t.border}}/>
            <div style={{textAlign:'center'}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:600}}>MARKET</p>
              <p style={{color:t.blue,fontWeight:800,fontSize:16}}>🇮🇳 NSE</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{background:t.surface,borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div>
              <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:8}}>QUANTITY</p>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:34,height:34,background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:20}}>−</button>
                <span style={{color:t.text,fontWeight:800,fontSize:20,minWidth:36,textAlign:'center'}}>{qty}</span>
                <button onClick={()=>setQty(q=>q+1)} style={{width:34,height:34,background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:20}}>+</button>
              </div>
            </div>
            <div>
              <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:8}}>PRODUCT</p>
              <select value={prod} onChange={e=>setProd(e.target.value)} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:12,padding:'8px 10px',fontFamily:'Space Grotesk,sans-serif',width:'100%'}}>
                <option value="MIS">MIS — Intraday (auto sq-off)</option>
                <option value="CNC">CNC — Delivery</option>
                <option value="NRML">NRML — F&O overnight</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:20}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={sl} onChange={e=>setSl(e.target.checked)} style={{width:16,height:16,accentColor:t.red}}/>
              <span style={{color:t.red,fontSize:12,fontWeight:600}}>Auto Stop Loss @ {fmtP(data.stopLoss)}</span>
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={tgt} onChange={e=>setTgt(e.target.checked)} style={{width:16,height:16,accentColor:t.green}}/>
              <span style={{color:t.green,fontSize:12,fontWeight:600}}>Auto Target @ {fmtP(data.target)}</span>
            </label>
          </div>
        </div>

        {/* Budget Breakdown */}
        {(() => {
          const entryAmt   = data.price * qty
          const slAmt      = data.stopLoss ? data.stopLoss * qty : null
          const tgtAmt     = data.target  ? data.target  * qty : null
          const maxLoss    = slAmt && data.signal==='BUY'  ? entryAmt - slAmt
                           : slAmt && data.signal==='SELL' ? slAmt - entryAmt : null
          const maxProfit  = tgtAmt && data.signal==='BUY'  ? tgtAmt - entryAmt
                           : tgtAmt && data.signal==='SELL' ? entryAmt - tgtAmt : null
          // Zerodha brokerage: Rs 20 per order (intraday flat fee x3 orders)
          const brokerage  = prod==='MIS' ? 60 : 40  // 3 orders x Rs20
          const netProfit  = maxProfit ? maxProfit - brokerage : null
          const netLoss    = maxLoss   ? maxLoss   + brokerage : null
          const fmtRs = (n) => n ? `₹${Math.abs(n).toLocaleString('en-IN',{maximumFractionDigits:0})}` : '—'
          return (
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:14,marginBottom:14}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}>💰 TRADE BUDGET BREAKDOWN</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div style={{background:t.blue+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.blue}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>CAPITAL REQUIRED</p>
                  <p style={{color:t.blue,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>{fmtRs(entryAmt)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>{qty} × ₹{data.price?.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                </div>
                <div style={{background:t.amber+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.amber}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>BROKERAGE (EST.)</p>
                  <p style={{color:t.amber,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>₹{brokerage}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>₹20 × {prod==='MIS'?3:2} orders</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{background:t.green+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.green}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>MAX PROFIT (NET)</p>
                  <p style={{color:t.green,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>+{fmtRs(netProfit)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>after brokerage</p>
                </div>
                <div style={{background:t.red+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.red}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>MAX LOSS (NET)</p>
                  <p style={{color:t.red,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>-{fmtRs(netLoss)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>incl. brokerage</p>
                </div>
              </div>
              {netProfit && netLoss && (
                <div style={{marginTop:8,padding:'6px 10px',background:t.card,borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:t.muted,fontSize:10,fontWeight:600}}>RETURN IF TARGET HIT</span>
                  <span style={{color:netProfit>0?t.green:t.red,fontWeight:700,fontSize:12}}>
                    {((netProfit/entryAmt)*100).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        {/* What happens note */}
        <div style={{background:t.blue+'0d',border:`1px solid ${t.blue}22`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:11,color:t.muted,lineHeight:1.8}}>
          ⚡ <span style={{color:t.blue,fontWeight:600}}>What happens:</span> Main {data.signal} order on NSE
          {sl?' → Auto Stop Loss (SL-M order)':''}
          {tgt?' → Auto Target (LIMIT order)':''}
          → All 3 saved to Trade History
        </div>

        {/* Result or Execute */}
        {result ? (
          <div style={{textAlign:'center',padding:16}}>
            <p style={{fontSize:40,marginBottom:8}}>{result.ok?'✅':'❌'}</p>
            <p style={{color:result.ok?t.green:t.red,fontWeight:700,fontSize:15,marginBottom:8}}>{result.msg}</p>
            {result.det && (
              <div style={{background:t.surface,borderRadius:10,padding:10,textAlign:'left',fontSize:11,marginBottom:12}}>
                {result.det.main_order_id   && <p style={{color:t.muted,marginBottom:4}}>Main Order: <span style={{color:t.text,fontFamily:'monospace'}}>{result.det.main_order_id}</span></p>}
                {result.det.sl_order_id     && <p style={{color:t.muted,marginBottom:4}}>SL Order: <span style={{color:t.red,fontFamily:'monospace'}}>{result.det.sl_order_id}</span></p>}
                {result.det.target_order_id && <p style={{color:t.muted}}>Target Order: <span style={{color:t.green,fontFamily:'monospace'}}>{result.det.target_order_id}</span></p>}
              </div>
            )}
            <button onClick={onClose} style={{padding:'8px 28px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <button onClick={place} disabled={placing} style={{
            width:'100%',padding:17,border:'none',borderRadius:14,
            background: placing ? t.surface : data.signal==='BUY'
              ? `linear-gradient(135deg,${t.green},${t.teal})`
              : `linear-gradient(135deg,${t.red},#ff6688)`,
            color: placing ? t.muted : '#fff',
            fontWeight:800,fontSize:16,
            cursor: placing?'not-allowed':'pointer',
            fontFamily:'Space Grotesk,sans-serif',
            boxShadow: !placing ? `0 4px 24px ${sc}44` : 'none',
            transition:'all 0.2s',
          }}>
            {!at ? '⚠️ Login with Zerodha first' : placing ? '⏳ Placing orders on NSE...' : `⚡ Place ${data.signal} + SL + Target`}
          </button>
        )}
      </div>
    </div>
  )
}

function SignalCard({strat,at,onTrade,t}) {
  const [sym,setSym]=useState(strat.symbols[0]),[data,setData]=useState(null),[loading,setLoading]=useState(false),[modal,setModal]=useState(false),[chart,setChart]=useState(false)
  useEffect(()=>{load()},[sym,strat.id])
  const [aiNote,   setAiNote]   = useState('')
  const [aiLoading,setAiLoading]= useState(false)

  async function load(){
    setLoading(true);setData(null)
    try{
      const r=await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`)
      const d=await r.json()
      setData(d)
      if(d.signal!=='HOLD') fetchAI(d)
      else setAiNote('')
    }catch{}
    setLoading(false)
  }

  async function fetchAI(d) {
    setAiLoading(true); setAiNote('')
    try {
      const r = await fetch('/api/ai-analysis',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'signal_analysis',data:{
          symbol:sym,signal:d.signal,strategy:strat.name,
          price:d.price,stopLoss:d.stopLoss,target:d.target,
          rsi:d.indicators?.rsi,confidence:d.confidence,
          reason:d.reason,today:d.today,capital:25000
        }})
      })
      const j=await r.json()
      if(j.analysis) setAiNote(j.analysis)
    } catch{}
    setAiLoading(false)
  }
  const sc=data?.signal==='BUY'?t.green:data?.signal==='SELL'?t.red:t.amber
  return (
    <>
      {modal&&data&&<ExecModal data={data} strat={strat} sym={sym} at={at} onClose={()=>setModal(false)} onDone={()=>{setModal(false);onTrade&&onTrade()}} t={t} />}
      <div style={{background:t.card,borderRadius:20,padding:22,boxShadow:t.glow,border:`1px solid ${t.border}`,display:'flex',flexDirection:'column',gap:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
              <span style={{fontSize:20}}>{strat.emoji}</span>
              <span style={{fontWeight:800,fontSize:15,color:t.text}}>{strat.name}</span>
              <Badge color={strat.type==='Swing'?t.amber:t.blue}>{strat.type}</Badge>
            </div>
            <p style={{color:t.muted,fontSize:12}}>{strat.desc}</p>
          </div>
          {data&&!loading&&<div style={{background:sc+'22',border:`2px solid ${sc}55`,borderRadius:12,padding:'6px 14px',color:sc,fontWeight:900,fontSize:14,flexShrink:0}}>{data.signal}</div>}
        </div>

        <div style={{display:'flex',gap:6}}>
          {strat.symbols.map(s=><button key={s} onClick={()=>setSym(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700,background:sym===s?t.accentC+'22':t.surface,border:`1.5px solid ${sym===s?t.accentC:t.border}`,color:sym===s?t.accentC:t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',transition:'all 0.15s'}}>{s}</button>)}
        </div>

        {loading&&<div style={{textAlign:'center',padding:20}}><div style={{width:30,height:30,border:`3px solid ${t.border}`,borderTopColor:t.accentC,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}} /><p style={{color:t.muted,fontSize:12}}>Fetching live data...</p></div>}

        {data&&!loading&&<>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
            {[{l:'PRICE',v:`₹${fmt(data.price)}`,c:t.text},{l:'STOP LOSS',v:data.stopLoss?`₹${fmt(data.stopLoss)}`:'—',c:t.red},{l:'TARGET',v:data.target?`₹${fmt(data.target)}`:'—',c:t.green},{l:'R:R',v:data.rr?`1:${data.rr}`:'—',c:data.rr>=2?t.green:data.rr>=1.5?t.amber:t.muted},{l:'CONFIDENCE',v:`${data.confidence}%`,c:data.confidence>70?t.green:data.confidence>50?t.amber:t.red}].map(x=>(
              <div key={x.l} style={{background:t.surface,borderRadius:10,padding:'10px 12px',border:`1px solid ${t.border}`}}>
                <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:13,fontWeight:800,fontFamily:'monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>


        {/* Signal Strength Bar */}
        {data.signal !== 'HOLD' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>SIGNAL STRENGTH</span>
              <span style={{color:data.confidence>=70?t.green:data.confidence>=50?t.amber:t.red,fontSize:10,fontWeight:800}}>
                {data.confidence>=70?'🟢 Strong':data.confidence>=50?'🟡 Moderate':'🔴 Weak'} · {data.confidence}%
              </span>
            </div>
            <div style={{height:7,background:t.surface,borderRadius:4,overflow:'hidden',border:`1px solid ${t.border}`}}>
              <div style={{
                height:'100%',width:`${Math.min(data.confidence,100)}%`,borderRadius:4,
                background:data.confidence>=70?`linear-gradient(90deg,${t.green},${t.teal})`:data.confidence>=50?`linear-gradient(90deg,${t.amber},#fbbf24)`:`linear-gradient(90deg,${t.red},#fb7185)`,
                transition:'width 0.6s ease',
                boxShadow:data.confidence>=70?`0 0 8px ${t.green}55`:'none',
              }}/>
            </div>
          </div>
        )}
          <div style={{background:t.surface,borderRadius:10,padding:'10px 14px',border:`1px solid ${t.border}`}}>
            <p style={{color:t.text2,fontSize:12,lineHeight:1.7}}>{data.reason}</p>
          </div>
          {(aiNote||aiLoading)&&(
            <div style={{background:t.purple+'0d',borderRadius:10,padding:'10px 14px',border:`1px solid ${t.purple}33`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                <span style={{fontSize:12}}>🤖</span>
                <span style={{color:t.purple,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>CLAUDE AI ANALYSIS</span>
                {aiLoading&&<div style={{width:10,height:10,border:`2px solid ${t.purple}44`,borderTopColor:t.purple,borderRadius:'50%',animation:'spin 0.8s linear infinite',marginLeft:'auto'}}/>}
              </div>
              {aiLoading
                ?<p style={{color:t.muted,fontSize:11,fontStyle:'italic'}}>Analysing signal...</p>
                :<p style={{color:t.text2,fontSize:11,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{aiNote}</p>
              }
            </div>
          )}

          {data.chartData&&<div style={{height:75}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.chartData}><defs><linearGradient id={`g${strat.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={sc} stopOpacity={0.3}/><stop offset="95%" stopColor={sc} stopOpacity={0}/></linearGradient></defs><XAxis dataKey="date" hide/><YAxis domain={['auto','auto']} hide/><Tooltip contentStyle={{background:t.card,border:`1px solid ${t.border}`,borderRadius:8,fontSize:11,color:t.text}}/><Area type="monotone" dataKey="close" stroke={sc} fill={`url(#g${strat.id})`} dot={false} strokeWidth={2}/></AreaChart></ResponsiveContainer></div>}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button onClick={()=>setChart(!chart)} style={{padding:'11px',background:t.surface,border:`1.5px solid ${chart?t.blue:t.border}`,borderRadius:10,color:t.blue,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'Space Grotesk,sans-serif',transition:'all 0.15s'}}>{chart?'✕ Close Chart':'📈 Kite Chart'}</button>
            <button onClick={()=>setModal(true)} disabled={data.signal==='HOLD'} style={{padding:'11px',border:'none',borderRadius:10,fontWeight:800,fontSize:12,cursor:data.signal==='HOLD'?'not-allowed':'pointer',background:data.signal==='HOLD'?t.surface:data.signal==='BUY'?`linear-gradient(135deg,${t.green},${t.teal})`:`linear-gradient(135deg,${t.red},#ff6688)`,color:data.signal==='HOLD'?t.muted:'#fff',fontFamily:'Space Grotesk,sans-serif',opacity:data.signal==='HOLD'?0.5:1,boxShadow:data.signal!=='HOLD'?`0 2px 12px ${sc}44`:'none'}}>
              {data.signal==='HOLD'?'Hold':'⚡ '+data.signal+' + SL + Target'}
            </button>
          </div>

          {chart&&<PZChart symbol={sym} t={t} h={380} accessToken={at} />}
        </>}
      </div>
    </>
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
        :<div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Symbol','Qty','Avg','LTP','P&L','Chart'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{pos.map((p,i)=>{const pl=p.pnl||p.unrealised||0;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{p.tradingsymbol}</td><td style={{padding:'12px 16px',color:(p.quantity||0)>0?t.green:t.red,fontWeight:700}}>{(p.quantity||0)>0?'+':''}{p.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>₹{fmt(p.average_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(p.last_price)}</td><td style={{padding:'12px 16px',color:clr(pl,t),fontWeight:800,fontFamily:'monospace'}}>{pl>=0?'+':''}₹{fmt(pl)}</td><td style={{padding:'12px 16px'}}><button onClick={()=>window.open(KITE_SEARCH[p.tradingsymbol]||`https://kite.zerodha.com/chart/web/ciq/NSE/${p.tradingsymbol}/EQ`,'_blank')} style={{padding:'4px 10px',background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:6,color:t.blue,cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>↗</button></td></tr>})}</tbody></table></div>}
      </div>
      {orders.length>0&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><p style={{color:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.1em'}}>TODAY'S ORDERS ({orders.length})</p><button onClick={load} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:11,padding:'4px 10px',fontFamily:'Space Grotesk,sans-serif'}}>🔄</button></div><div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Time','Symbol','Type','Qty','Price','Status'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{orders.map((o,i)=>{const time=o.order_timestamp?new Date(o.order_timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}):'—';const sc2=o.status==='COMPLETE'?t.green:o.status==='REJECTED'?t.red:o.status==='OPEN'?t.amber:t.muted;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',color:t.muted}}>{time}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{o.tradingsymbol}</td><td style={{padding:'12px 16px'}}><span style={{color:o.transaction_type==='BUY'?t.green:t.red,fontWeight:700}}>{o.transaction_type}</span></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{o.filled_quantity}/{o.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(o.average_price||o.price)}</td><td style={{padding:'12px 16px'}}><Badge color={sc2}>{o.status}</Badge></td></tr>})}</tbody></table></div></div>}
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
        <button onClick={()=>window.open(`/chart?symbol=${sel}`,'_blank','width=1400,height=800,menubar=no,toolbar=no')} style={{padding:'8px 18px',background:t.accent,border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif'}} onClick={()=>window.open(`/chart?symbol=${sel}`,'_blank','width=1400,height=800')}>⛶ Full Screen</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {syms.map(s=><button key={s} onClick={()=>setSel(s)} style={{padding:'7px 16px',borderRadius:20,fontSize:13,fontWeight:700,background:sel===s?t.accentC:t.surface,border:`1.5px solid ${sel===s?t.accentC:t.border}`,color:sel===s?'#fff':t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',transition:'all 0.15s'}}>{s}</button>)}
      </div>
      <PZChart symbol={sel} t={t} h={520} accessToken={at} key={sel} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8,marginTop:14}}>
        {syms.filter(s=>s!==sel).map(s=><button key={s} onClick={()=>setSel(s)} style={{padding:'10px',background:t.card,border:`1px solid ${t.border}`,borderRadius:12,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',textAlign:'left',transition:'all 0.15s'}}><span style={{color:t.muted,fontSize:10,fontWeight:700,display:'block',marginBottom:3}}>CHART</span><span style={{color:t.text,fontSize:13,fontWeight:800}}>{s}</span></button>)}
      </div>
    </div>
  )
}

function History({refresh,t}) {
  const [trades,setTrades]=useState([]),[loading,setLoading]=useState(false)
  useEffect(()=>{load()},[refresh])
  async function load(){setLoading(true);try{const r=await fetch('/api/trades?limit=50');const d=await r.json();setTrades(d.trades||[])}catch{}setLoading(false)}
  async function close(id,entry,dir){
    const ep=prompt(`Close Trade\nDirection: ${dir}\nEntry Price: ₹${entry}\n\nEnter exit price:`)
    if(!ep||isNaN(parseFloat(ep)))return
    const r=await fetch('/api/trades',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})})
    const d=await r.json()
    const pnl=d.pnl||d.trade?.pnl
    if(pnl!==undefined){alert(`Trade Closed!\nP&L: ₹${Number(pnl).toFixed(2)}\n${pnl>0?'🟢 Profit!':'🔴 Loss'}`)}
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
      {!loading&&trades.length===0&&<div style={{textAlign:'center',padding:50,background:t.surface,borderRadius:16,border:`1px solid ${t.border}`}}><p style={{fontSize:40,marginBottom:10}}>📋</p><p style={{color:t.text,fontWeight:700}}>No trades yet</p><p style={{color:t.muted,fontSize:13,marginTop:4}}>Execute a signal to start</p></div>}
      {!loading&&trades.length>0&&<div style={{overflowX:'auto',borderRadius:16,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Date','Symbol','Strategy','Dir','Qty','Entry','Exit','P&L','Status',''].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead><tbody>{trades.map((x,i)=>{const pc=clr(x.pnl||0,t),date=new Date(x.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});return <tr key={x.id} style={{borderBottom:`1px solid ${t.border}22`,background:i%2?t.surface+'44':'transparent'}}><td style={{padding:'12px 16px',color:t.muted,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{x.symbol}</td><td style={{padding:'12px 16px',color:t.muted,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.strategy}</td><td style={{padding:'12px 16px'}}><Badge color={x.direction==='BUY'?t.green:t.red}>{x.direction}</Badge></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(x.entry_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.exit_price?`₹${fmt(x.exit_price)}`:'—'}</td><td style={{padding:'12px 16px',color:pc,fontWeight:800,fontFamily:'monospace'}}>{x.pnl!=null?`${x.pnl>=0?'+':''}₹${fmt(x.pnl)}`:'—'}</td><td style={{padding:'12px 16px'}}><Badge color={x.status==='OPEN'?t.amber:x.status==='CLOSED'?t.green:t.red}>{x.status}</Badge></td><td style={{padding:'12px 16px'}}>{x.status==='OPEN'&&<button onClick={()=>close(x.id,x.entry_price,x.direction)} style={{padding:'5px 12px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Close</button>}</td></tr>})}</tbody></table></div>}
    </div>
  )
}


// ── Crypto Signal Card ─────────────────────────────────────────


// ── Mini sparkline chart (reusable) ───────────────────────────
function AreaChartMini({data, color}) {
  const gradId = 'mini' + (color||'').replace(/[^a-zA-Z0-9]/g,'')
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide/>
        <YAxis domain={['auto','auto']} hide/>
        <Tooltip contentStyle={{background:'#111827',border:'1px solid #1f2937',borderRadius:8,fontSize:11,color:'#f9fafb'}}/>
        <Area type="monotone" dataKey="close" stroke={color} fill={`url(#${gradId})`} dot={false} strokeWidth={2}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Crypto Execute Modal (Binance) ─────────────────────────────
function CryptoExecModal({data, sym, stratName, onClose, onDone, t}) {
  const fmtD  = (n) => n ? `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
  const [qty,     setQty]    = useState(0.001)
  const QTY_STEP = sym==='BTC'?0.001:sym==='ETH'?0.01:sym==='BNB'?0.01:sym==='XRP'?1:sym==='DOGE'?10:0.1
  const [placing, setPlacing]= useState(false)
  const [result,  setResult] = useState(null)
  const [sl,      setSl]     = useState(true)
  const [tgt,     setTgt]    = useState(true)

  const sc     = data.signal==='BUY' ? t.green : t.red
  const risk   = data.stopLoss ? Math.abs(data.price - data.stopLoss)*qty : null
  const reward = data.target   ? Math.abs(data.target - data.price)*qty   : null
  const rr     = risk && reward ? (reward/risk).toFixed(1) : null

  async function place() {
    setPlacing(true)
    try {
      const r = await fetch('/api/binance?action=place_order', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          symbol: sym,
          side:              data.signal,
          quantity:          qty,
          order_type:        'MARKET',
          stop_loss_price:   sl  && data.stopLoss ? data.stopLoss : null,
          take_profit_price: tgt && data.target   ? data.target   : null,
        })
      })
      const d = await r.json()
      if (d.status === 'success') {
        await fetch('/api/trades', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            symbol: sym, direction: data.signal, quantity: qty,
            entry_price: data.price, stop_loss: data.stopLoss,
            target: data.target, strategy: stratName,
            order_id: d.results?.main_order_id,
            notes: `Crypto/Binance SL:${d.results?.sl_order_id||'—'} TP:${d.results?.tp_order_id||'—'}`
          })
        })
        setResult({ok:true, msg:d.message, det:d.results})
        onDone && onDone()
      } else {
        setResult({ok:false, msg: d.error || 'Order failed — check Binance API permissions'})
      }
    } catch(e) { setResult({ok:false, msg:e.message}) }
    setPlacing(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:16}}>
      <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:24,padding:28,width:480,maxWidth:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:`0 0 60px ${sc}22`}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{background:sc+'22',border:`2px solid ${sc}`,borderRadius:12,padding:'8px 18px',color:sc,fontWeight:900,fontSize:20}}>{data.signal}</div>
            <div>
              <p style={{fontWeight:800,fontSize:17,color:t.text}}>{sym}/USDT</p>
              <p style={{color:t.muted,fontSize:12}}>{stratName} · Binance</p>
            </div>
          </div>
          <button onClick={onClose} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.muted,cursor:'pointer',fontSize:20,width:36,height:36,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>

        {/* Price boxes */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
          {[
            {l:'ENTRY',    v:fmtD(data.price),    c:t.blue},
            {l:'STOP LOSS',v:fmtD(data.stopLoss),  c:t.red,  s:risk?`Risk $${risk.toFixed(2)}`:null},
            {l:'TARGET',   v:fmtD(data.target),    c:t.green, s:reward?`Gain $${reward.toFixed(2)}`:null},
          ].map(x=>(
            <div key={x.l} style={{background:t.surface,borderRadius:12,padding:'12px 14px',border:`1px solid ${t.border}`}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.1em',marginBottom:4}}>{x.l}</p>
              <p style={{color:x.c,fontSize:13,fontWeight:800,fontFamily:'monospace'}}>{x.v}</p>
              {x.s&&<p style={{color:t.muted,fontSize:10,marginTop:3}}>{x.s}</p>}
            </div>
          ))}
        </div>

        {/* R:R */}
        {rr && (
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 16px',marginBottom:14,display:'flex',justifyContent:'space-around'}}>
            <div style={{textAlign:'center'}}><p style={{color:t.muted,fontSize:10,fontWeight:600}}>RISK:REWARD</p><p style={{color:t.text,fontWeight:800,fontSize:16}}>1:{rr}</p></div>
            <div style={{width:1,background:t.border}}/>
            <div style={{textAlign:'center'}}><p style={{color:t.muted,fontSize:10,fontWeight:600}}>CONFIDENCE</p><p style={{color:data.confidence>70?t.green:data.confidence>50?t.amber:t.red,fontWeight:800,fontSize:16}}>{data.confidence}%</p></div>
            <div style={{width:1,background:t.border}}/>
            <div style={{textAlign:'center'}}><p style={{color:t.muted,fontSize:10,fontWeight:600}}>MARKET</p><p style={{color:t.amber,fontWeight:800,fontSize:16}}>🪙 Binance</p></div>
          </div>
        )}

        {/* Qty + SL/TP */}
        <div style={{background:t.surface,borderRadius:14,padding:16,marginBottom:14}}>
          <div style={{marginBottom:14}}>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:8}}>QUANTITY ({sym})</p>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>setQty(q=>Math.max(QTY_STEP, parseFloat((q-QTY_STEP).toFixed(6))))} style={{width:34,height:34,background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:20}}>−</button>
              <span style={{color:t.text,fontWeight:800,fontSize:18,minWidth:80,textAlign:'center',fontFamily:'monospace'}}>{qty}</span>
              <button onClick={()=>setQty(q=>parseFloat((q+QTY_STEP).toFixed(6)))} style={{width:34,height:34,background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:20}}>+</button>
              <span style={{color:t.muted,fontSize:11}}>≈ ${(qty*data.price).toFixed(2)} USDT</span>
            </div>
          </div>
          <div style={{display:'flex',gap:20}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={sl} onChange={e=>setSl(e.target.checked)} style={{width:16,height:16,accentColor:t.red}}/>
              <span style={{color:t.red,fontSize:12,fontWeight:600}}>Auto Stop Loss @ {fmtD(data.stopLoss)}</span>
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={tgt} onChange={e=>setTgt(e.target.checked)} style={{width:16,height:16,accentColor:t.green}}/>
              <span style={{color:t.green,fontSize:12,fontWeight:600}}>Auto Target @ {fmtD(data.target)}</span>
            </label>
          </div>
        </div>

        {/* Budget Breakdown */}
        {(() => {
          const entryAmt  = data.price * qty
          const slAmt     = data.stopLoss ? data.stopLoss * qty : null
          const tgtAmt    = data.target   ? data.target   * qty : null
          const maxLoss   = slAmt && data.signal==='BUY'  ? entryAmt - slAmt
                          : slAmt && data.signal==='SELL' ? slAmt - entryAmt : null
          const maxProfit = tgtAmt && data.signal==='BUY'  ? tgtAmt - entryAmt
                          : tgtAmt && data.signal==='SELL' ? entryAmt - tgtAmt : null
          const fee       = entryAmt * 0.001  // Binance 0.1% taker fee x2
          const netProfit = maxProfit ? maxProfit - fee  : null
          const netLoss   = maxLoss   ? maxLoss   + fee  : null
          const fmtD = (n) => n ? `$${Math.abs(n).toFixed(2)}` : '—'
          return (
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:14,marginBottom:14}}>
              <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.1em',marginBottom:10}}>💰 TRADE BUDGET BREAKDOWN</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div style={{background:t.blue+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.blue}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>CAPITAL REQUIRED</p>
                  <p style={{color:t.blue,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>{fmtD(entryAmt)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>{qty} {sym} × ${data.price?.toLocaleString('en-US',{maximumFractionDigits:2})}</p>
                </div>
                <div style={{background:t.amber+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.amber}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>TRADING FEE (EST.)</p>
                  <p style={{color:t.amber,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>{fmtD(fee)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>0.1% × 2 orders</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div style={{background:t.green+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.green}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>MAX PROFIT (NET)</p>
                  <p style={{color:t.green,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>+{fmtD(netProfit)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>after fees</p>
                </div>
                <div style={{background:t.red+'0d',borderRadius:8,padding:'8px 12px',border:`1px solid ${t.red}22`}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:600,marginBottom:3}}>MAX LOSS (NET)</p>
                  <p style={{color:t.red,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>-{fmtD(netLoss)}</p>
                  <p style={{color:t.muted,fontSize:10,marginTop:2}}>incl. fees</p>
                </div>
              </div>
              {netProfit && netLoss && (
                <div style={{marginTop:8,padding:'6px 10px',background:t.card,borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{color:t.muted,fontSize:10,fontWeight:600}}>RETURN IF TARGET HIT</span>
                  <span style={{color:netProfit>0?t.green:t.red,fontWeight:700,fontSize:12}}>
                    {((netProfit/entryAmt)*100).toFixed(3)}%
                  </span>
                </div>
              )}
            </div>
          )
        })()}

        {/* Info */}
        <div style={{background:t.amber+'0d',border:`1px solid ${t.amber}22`,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:11,color:t.muted,lineHeight:1.8}}>
          🪙 <span style={{color:t.amber,fontWeight:600}}>Binance order:</span> Market {data.signal} {qty} {sym}
          {sl?' → Auto Stop Loss':''}
          {tgt?' → Auto Take Profit':''}
          → Saved to Trade History
        </div>

        {/* Result or Button */}
        {result ? (
          <div style={{textAlign:'center',padding:16}}>
            <p style={{fontSize:40,marginBottom:8}}>{result.ok?'✅':'❌'}</p>
            <p style={{color:result.ok?t.green:t.red,fontWeight:700,fontSize:15,marginBottom:8}}>{result.msg}</p>
            {result.det && (
              <div style={{background:t.surface,borderRadius:10,padding:10,textAlign:'left',fontSize:11,marginBottom:12}}>
                {result.det.main_order_id && <p style={{color:t.muted,marginBottom:4}}>Order: <span style={{color:t.text,fontFamily:'monospace'}}>{result.det.main_order_id}</span></p>}
                {result.det.sl_order_id   && <p style={{color:t.muted,marginBottom:4}}>SL: <span style={{color:t.red,fontFamily:'monospace'}}>{result.det.sl_order_id}</span></p>}
                {result.det.tp_order_id   && <p style={{color:t.muted}}>TP: <span style={{color:t.green,fontFamily:'monospace'}}>{result.det.tp_order_id}</span></p>}
              </div>
            )}
            <button onClick={onClose} style={{padding:'8px 28px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <button onClick={place} disabled={placing} style={{
            width:'100%',padding:17,border:'none',borderRadius:14,
            background: placing ? t.surface : data.signal==='BUY'
              ? `linear-gradient(135deg,${t.green},${t.teal})`
              : `linear-gradient(135deg,${t.red},#ff6688)`,
            color: placing?t.muted:'#fff',
            fontWeight:800,fontSize:16,cursor:placing?'not-allowed':'pointer',
            fontFamily:'Space Grotesk,sans-serif',
            boxShadow:!placing?`0 4px 24px ${sc}44`:'none',
            transition:'all 0.2s',
          }}>
            {placing?'⏳ Placing on Binance...':`⚡ Place ${data.signal} ${qty} ${sym} + SL + Target`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Crypto Signal Card ─────────────────────────────────────────
function CryptoSignalCard({symbol, strategy, stratName, t}) {
  const [data,     setData]    = useState(null)
  const [loading,  setLoading] = useState(false)
  const [modal,    setModal]   = useState(false)
  const [aiNote,   setAiNote]  = useState('')
  const [aiLoading,setAiLoad]  = useState(false)

  useEffect(() => { load() }, [symbol, strategy])

  async function load() {
    setLoading(true); setData(null); setAiNote('')
    try {
      const r = await fetch(`/api/crypto-signals?symbol=${symbol}&strategy=${strategy}`)
      const d = await r.json()
      setData(d)
      if (d.signal !== 'HOLD') fetchAI(d)
    } catch {}
    setLoading(false)
  }

  async function fetchAI(d) {
    setAiLoad(true); setAiNote('')
    try {
      const r = await fetch('/api/ai-analysis', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({type:'signal_analysis', data:{
          symbol, signal:d.signal, strategy:stratName,
          price:d.price, stopLoss:d.stopLoss, target:d.target,
          rsi:d.indicators?.rsi, confidence:d.confidence,
          reason:d.reason, today:d.today,
          capital:25000,
          marketContext:{note:'Crypto market — Binance — 24/7 trading'}
        }})
      })
      const j = await r.json()
      if (j.analysis) setAiNote(j.analysis)
    } catch {}
    setAiLoad(false)
  }

  const sc    = data?.signal==='BUY' ? t.green : data?.signal==='SELL' ? t.red : t.amber
  const fmtP  = (n) => n ? `$${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
  const emoji = symbol==='BTC'?'₿':symbol==='ETH'?'Ξ':symbol==='SOL'?'◎':symbol==='BNB'?'🔶':symbol==='XRP'?'◈':'🪙'

  return (
    <>
      {modal && data && (
        <CryptoExecModal
          data={data} sym={symbol} stratName={stratName}
          onClose={()=>setModal(false)}
          onDone={()=>setModal(false)}
          t={t}
        />
      )}

      <div style={{background:t.card,borderRadius:20,padding:22,border:`1px solid ${t.border}`,display:'flex',flexDirection:'column',gap:12}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontSize:20}}>{emoji}</span>
              <span style={{fontWeight:800,fontSize:15,color:t.text}}>{symbol}/USDT</span>
              <span style={{background:t.amber+'22',color:t.amber,border:`1px solid ${t.amber}44`,borderRadius:20,padding:'2px 8px',fontSize:10,fontWeight:700}}>Binance</span>
            </div>
            <p style={{color:t.muted,fontSize:11}}>{stratName}</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button onClick={load} style={{background:'none',border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:'pointer',fontSize:13,padding:'2px 6px'}}>↻</button>
            {data && !loading && (
              <div style={{background:sc+'22',border:`2px solid ${sc}55`,borderRadius:12,padding:'6px 14px',color:sc,fontWeight:900,fontSize:14}}>{data.signal}</div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{textAlign:'center',padding:20}}>
            <div style={{width:30,height:30,border:`3px solid ${t.border}`,borderTopColor:t.amber,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 8px'}}/>
            <p style={{color:t.muted,fontSize:12}}>Fetching Binance data...</p>
          </div>
        )}

        {data && !loading && <>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[
              {l:'PRICE',     v:fmtP(data.price),      c:t.text},
              {l:'STOP LOSS', v:fmtP(data.stopLoss),   c:t.red},
              {l:'TARGET',    v:fmtP(data.target),      c:t.green},
              {l:'RSI',       v:data.indicators?.rsi||'—', c:data.indicators?.rsi>65?t.red:data.indicators?.rsi<35?t.green:t.amber},
            ].map(x=>(
              <div key={x.l} style={{background:t.surface,borderRadius:10,padding:'9px 11px',border:`1px solid ${t.border}`}}>
                <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:3}}>{x.l}</p>
                <p style={{color:x.c,fontSize:12,fontWeight:800,fontFamily:'monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          {/* Indicator badges */}
          {data.rr && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <span style={{background:t.blue+'18',color:t.blue,border:`1px solid ${t.blue}33`,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>R:R 1:{data.rr}</span>
              <span style={{background:t.muted+'18',color:t.muted,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>{data.confidence}% conf</span>
              {data.indicators?.macdHist!==undefined && (
                <span style={{background:(data.indicators.macdHist>0?t.green:t.red)+'18',color:data.indicators.macdHist>0?t.green:t.red,border:`1px solid ${(data.indicators.macdHist>0?t.green:t.red)}33`,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>
                  MACD {data.indicators.macdHist>0?'▲':'▼'}
                </span>
              )}
              {data.indicators?.volRatio && (
                <span style={{background:t.amber+'18',color:t.amber,border:`1px solid ${t.amber}33`,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>
                  Vol {data.indicators.volRatio}x
                </span>
              )}
              <span style={{background:t.muted+'18',color:t.muted,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700}}>
                ATR ${Number(data.indicators?.atr||0).toLocaleString('en-US',{maximumFractionDigits:0})}
              </span>
            </div>
          )}


        {/* Signal Strength Bar */}
        {data.signal !== 'HOLD' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>SIGNAL STRENGTH</span>
              <span style={{color:data.confidence>=70?t.green:data.confidence>=50?t.amber:t.red,fontSize:10,fontWeight:800}}>
                {data.confidence>=70?'🟢 Strong':data.confidence>=50?'🟡 Moderate':'🔴 Weak'} · {data.confidence}%
              </span>
            </div>
            <div style={{height:7,background:t.surface,borderRadius:4,overflow:'hidden',border:`1px solid ${t.border}`}}>
              <div style={{
                height:'100%',width:`${Math.min(data.confidence,100)}%`,borderRadius:4,
                background:data.confidence>=70?`linear-gradient(90deg,${t.green},${t.teal})`:data.confidence>=50?`linear-gradient(90deg,${t.amber},#fbbf24)`:`linear-gradient(90deg,${t.red},#fb7185)`,
                transition:'width 0.6s ease',
                boxShadow:data.confidence>=70?`0 0 8px ${t.green}55`:'none',
              }}/>
            </div>
          </div>
        )}
          {/* Reason */}
          <div style={{background:t.surface,borderRadius:10,padding:'10px 14px',border:`1px solid ${t.border}`}}>
            <p style={{color:t.text2,fontSize:12,lineHeight:1.7}}>{data.reason}</p>
          </div>

          {/* Mini sparkline chart */}
          {data.chartData && data.chartData.length > 0 && (
            <div style={{height:65}}>
              <AreaChartMini data={data.chartData} color={sc} />
            </div>
          )}

          {/* AI Analysis */}
          {(aiNote || aiLoading) && (
            <div style={{background:t.purple+'0d',borderRadius:10,padding:'10px 14px',border:`1px solid ${t.purple}33`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                <span style={{fontSize:12}}>🤖</span>
                <span style={{color:t.purple,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>CLAUDE AI ANALYSIS</span>
                {aiLoading && <div style={{width:10,height:10,border:`2px solid ${t.purple}44`,borderTopColor:t.purple,borderRadius:'50%',animation:'spin 0.8s linear infinite',marginLeft:'auto'}}/>}
              </div>
              {aiLoading
                ? <p style={{color:t.muted,fontSize:11,fontStyle:'italic'}}>Analysing crypto signal...</p>
                : <p style={{color:t.text2,fontSize:11,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{aiNote}</p>
              }
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button
              onClick={()=>window.open(`/chart?symbol=${symbol}&market=crypto`,'_blank','width=1440,height=860')}
              style={{padding:'11px',background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:10,color:t.amber,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}
            >
              📈 Binance Chart
            </button>
            <button
              onClick={()=>data.signal!=='HOLD'&&setModal(true)}
              disabled={data.signal==='HOLD'}
              style={{
                padding:'11px',border:'none',borderRadius:10,fontWeight:800,fontSize:12,
                cursor:data.signal==='HOLD'?'not-allowed':'pointer',
                background:data.signal==='HOLD'?t.surface:data.signal==='BUY'
                  ?`linear-gradient(135deg,${t.green},${t.teal})`
                  :`linear-gradient(135deg,${t.red},#ff6688)`,
                color:data.signal==='HOLD'?t.muted:'#fff',
                fontFamily:'Space Grotesk,sans-serif',
                opacity:data.signal==='HOLD'?0.5:1,
                boxShadow:data.signal!=='HOLD'?`0 2px 12px ${sc}44`:'none',
              }}
            >
              {data.signal==='HOLD'?'Hold — No Signal':`⚡ ${data.signal} on Binance`}
            </button>
          </div>
        </>}
      </div>
    </>
  )
}


// ── Crypto Tab ─────────────────────────────────────────────────
function CryptoTab({t, at}) {
  const CRYPTO_STRATEGIES = [
    {symbol:'BTC', strategy:'momentum',     name:'BTC EMA Momentum'},
    {symbol:'ETH', strategy:'macd-cross',   name:'ETH MACD Cross'},
    {symbol:'SOL', strategy:'rsi-reversal', name:'SOL RSI Reversal'},
    {symbol:'BNB', strategy:'bb-breakout',  name:'BNB Bollinger Breakout'},
    {symbol:'ETH', strategy:'momentum',     name:'ETH EMA Momentum'},
    {symbol:'BTC', strategy:'macd-cross',   name:'BTC MACD Cross'},
    {symbol:'XRP', strategy:'rsi-reversal', name:'XRP RSI Reversal'},
    {symbol:'SOL', strategy:'bb-breakout',  name:'SOL Bollinger Breakout'},
  ]

  const [prices,  setPrices]  = useState({})
  const [lastUpd, setLastUpd] = useState(null)

  useEffect(() => {
    fetchPrices()
    const ti = setInterval(fetchPrices, 5000)
    return () => clearInterval(ti)
  }, [])

  async function fetchPrices() {
    try {
      const r = await fetch('/api/binance?action=prices')
      const d = await r.json()
      if (d.prices) { setPrices(d.prices); setLastUpd(new Date()) }
    } catch {}
  }

  const SYMS = ['BTC','ETH','SOL','BNB','XRP','DOGE']

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Crypto Markets</h2>
          <p style={{color:t.muted,fontSize:13,marginTop:5}}>
            Live Binance data · 4 strategies · BTC/ETH/SOL/BNB/XRP
            {lastUpd && <span style={{color:t.muted,fontSize:11}}> · Updated {Math.round((new Date()-lastUpd)/1000)}s ago</span>}
          </p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:t.green,display:'inline-block',animation:'pulse 1.5s infinite'}}/>
          <span style={{color:t.green,fontSize:12,fontWeight:600}}>Binance Live</span>
        </div>
      </div>

      {/* Live price ticker */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:24}}>
        {SYMS.map(sym => {
          const d = prices[sym]
          const up = (d?.pct||0) >= 0
          return (
            <div
              key={sym}
              onClick={()=>window.open(`/chart?symbol=${sym}&market=crypto`,'_blank','width=1440,height=860')}
              style={{background:t.card,borderRadius:14,padding:'14px 16px',border:`1px solid ${t.border}`,cursor:'pointer',transition:'all 0.15s'}}
            >
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <p style={{color:t.muted,fontSize:11,fontWeight:700}}>{sym}/USDT</p>
                <span style={{fontSize:10}}>📈</span>
              </div>
              <p style={{color:t.text,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>
                {d ? `$${Number(d.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '...'}
              </p>
              {d && (
                <p style={{color:up?t.green:t.red,fontSize:11,fontWeight:700,marginTop:4}}>
                  {up?'+':''}{d.pct?.toFixed(2)}%
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Signal cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:18}}>
        {CRYPTO_STRATEGIES.map(s => (
          <CryptoSignalCard
            key={`${s.symbol}-${s.strategy}`}
            symbol={s.symbol}
            strategy={s.strategy}
            stratName={s.name}
            t={t}
          />
        ))}
      </div>

      {/* Info bar */}
      <div style={{marginTop:20,background:t.surface,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:14}}>🪙</span>
        <p style={{color:t.muted,fontSize:12}}>
          Crypto markets run 24/7. Charts open in fullscreen with all 9 timeframes (1m to 1W).
          Execute button places order on Binance with auto Stop Loss + Take Profit simultaneously.
          AI analysis fires automatically on every BUY/SELL signal.
        </p>
      </div>
    </div>
  )
}

// ── Market Regime Banner ───────────────────────────────────────
function MarketRegimeBanner({t}) {
  const [regime, setRegime] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/market-regime')
      const d = await r.json()
      if (d.status === 'success') setRegime(d)
    } catch {}
    setLoading(false)
  }

  if (loading) return (
    <div style={{background:t.surface,borderRadius:14,padding:'14px 18px',marginBottom:16,border:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:10}}>
      <div style={{width:10,height:10,border:`2px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <span style={{color:t.muted,fontSize:12}}>Analysing market regime...</span>
    </div>
  )

  if (!regime) return null

  const fng = regime.fearGreed

  return (
    <div style={{marginBottom:16}}>
      {/* Regime banner */}
      <div style={{background:regime.color+'0d',border:`1px solid ${regime.color}33`,borderRadius:14,padding:'14px 18px',display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-start'}}>
        <div style={{flex:1,minWidth:200}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{fontSize:20}}>{regime.regimeEmoji}</span>
            <span style={{color:regime.color,fontWeight:900,fontSize:16,letterSpacing:'0.05em'}}>{regime.regime}</span>
            <span style={{background:regime.color+'22',color:regime.color,borderRadius:20,padding:'2px 10px',fontSize:10,fontWeight:700,border:`1px solid ${regime.color}44`}}>MARKET REGIME</span>
          </div>
          <p style={{color:t.text2,fontSize:12,lineHeight:1.7,marginBottom:8}}>{regime.description}</p>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <div>
              <span style={{color:t.muted,fontSize:10,fontWeight:600}}>BEST NOW: </span>
              {regime.bestStrategies?.map(s=>(
                <span key={s} style={{background:t.green+'18',color:t.green,borderRadius:20,padding:'1px 8px',fontSize:10,fontWeight:600,marginRight:4,border:`1px solid ${t.green}33`}}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {[
            {l:'NIFTY',    v:`₹${regime.metrics?.niftyPrice?.toLocaleString('en-IN')}`, c:t.text},
            {l:'DAY CHG',  v:`${regime.metrics?.dayChange>0?'+':''}${regime.metrics?.dayChange}%`, c:regime.metrics?.dayChange>0?t.green:t.red},
            {l:'VOLATILITY',v:`${regime.metrics?.atrPct?.toFixed(2)}% ATR`, c:regime.metrics?.atrPct>0.8?t.red:t.amber},
            {l:'TREND',    v:regime.metrics?.emaTrend?.replace('_',' '), c:regime.metrics?.emaTrend?.includes('UP')?t.green:t.red},
          ].map(m=>(
            <div key={m.l} style={{background:t.card,borderRadius:8,padding:'8px 12px',border:`1px solid ${t.border}`,textAlign:'center',minWidth:70}}>
              <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.08em',marginBottom:3}}>{m.l}</p>
              <p style={{color:m.c,fontSize:11,fontWeight:800}}>{m.v}</p>
            </div>
          ))}
        </div>

        {/* Day of week insight */}
        {regime.dayOfWeek && (
          <div style={{width:'100%',background:t.card,borderRadius:10,padding:'8px 14px',border:`1px solid ${t.border}`,fontSize:12,color:t.text2}}>
            {regime.dayOfWeek.insight}
          </div>
        )}
      </div>

      {/* Fear & Greed */}
      {fng && (
        <div style={{background:t.card,borderRadius:12,padding:'12px 18px',marginTop:10,border:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div>
            <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em',marginBottom:4}}>CRYPTO FEAR & GREED INDEX</p>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{
                width:48,height:48,borderRadius:'50%',
                background:fng.value<25?t.red+'22':fng.value<45?t.amber+'22':fng.value<55?t.muted+'22':fng.value<75?t.green+'22':t.green+'33',
                border:`3px solid ${fng.value<25?t.red:fng.value<45?t.amber:fng.value<55?t.muted:t.green}`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontWeight:900,fontSize:16,color:fng.value<25?t.red:fng.value<45?t.amber:fng.value<55?t.muted:t.green
              }}>{fng.value}</div>
              <div>
                <p style={{color:t.text,fontWeight:700,fontSize:13}}>{fng.label}</p>
                <p style={{color:t.muted,fontSize:11}}>{fng.sentiment}</p>
              </div>
            </div>
          </div>
          {/* History bars */}
          {fng.history && fng.history.length > 0 && (
            <div style={{display:'flex',gap:4,alignItems:'flex-end',height:40}}>
              {fng.history.slice(0,7).reverse().map((d,i)=>(
                <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <div style={{
                    width:16,
                    height:Math.max(4,(d.value/100)*36),
                    borderRadius:3,
                    background:d.value<35?t.red:d.value<55?t.amber:t.green,
                    opacity:i===6?1:0.5+i*0.08,
                  }}/>
                  <span style={{color:t.muted,fontSize:8}}>{d.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── News Bar ───────────────────────────────────────────────────
function NewsBar({t, market}) {
  const [news,    setNews]    = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => { load() }, [market])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/news?market=${market}`)
      const d = await r.json()
      if (d.news) setNews(d.news)
    } catch {}
    setLoading(false)
  }

  if (loading) return (
    <div style={{background:t.surface,borderRadius:12,padding:'10px 16px',border:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:14}}>📰</span>
      <span style={{color:t.muted,fontSize:12}}>Loading market news...</span>
    </div>
  )

  if (!news.length) return null
  const shown = expanded ? news : news.slice(0, 3)

  return (
    <div style={{background:t.card,borderRadius:12,border:`1px solid ${t.border}`,overflow:'hidden'}}>
      <div style={{padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:`1px solid ${t.border}`}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:14}}>📰</span>
          <span style={{color:t.text,fontSize:13,fontWeight:700}}>Market News</span>
          <span style={{background:t.blue+'22',color:t.blue,borderRadius:20,padding:'1px 8px',fontSize:10,fontWeight:700}}>{news.length}</span>
        </div>
        <button onClick={()=>setExpanded(e=>!e)} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:12,fontWeight:600}}>
          {expanded?'Show less ↑':'Show more ↓'}
        </button>
      </div>
      {shown.map((item,i)=>(
        <div key={i} style={{padding:'10px 16px',borderBottom:i<shown.length-1?`1px solid ${t.border}`:'none',display:'flex',alignItems:'flex-start',gap:10}}>
          <span style={{fontSize:14,flexShrink:0,marginTop:1}}>{item.sentEmoji}</span>
          <div style={{flex:1,minWidth:0}}>
            <a href={item.link} target="_blank" rel="noopener noreferrer"
              style={{color:t.text,fontSize:12,fontWeight:600,textDecoration:'none',lineHeight:1.5,display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {item.title}
            </a>
            <div style={{display:'flex',gap:8,marginTop:3}}>
              {item.source && <span style={{color:t.muted,fontSize:10}}>{item.source}</span>}
              <span style={{color:t.muted,fontSize:10}}>{item.timeAgo}</span>
              <span style={{color:item.sentiment==='bullish'?t.green:item.sentiment==='bearish'?t.red:t.muted,fontSize:10,fontWeight:600,textTransform:'capitalize'}}>{item.sentiment}</span>
            </div>
          </div>
        </div>
      ))}
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
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Space Grotesk,sans-serif'}}>
              <option value="india">🇮🇳 Indian</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>SYMBOL</p>
            <select value={form.symbol} onChange={e=>setForm(f=>({...f,symbol:e.target.value}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Space Grotesk,sans-serif'}}>
              {syms.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:600,marginBottom:6}}>CONDITION</p>
            <select value={form.condition} onChange={e=>setForm(f=>({...f,condition:e.target.value}))}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 10px',width:'100%',fontFamily:'Space Grotesk,sans-serif'}}>
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
            style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Space Grotesk,sans-serif',boxSizing:'border-box'}}/>
        </div>

        {msg&&<p style={{color:msg.includes('✅')?t.green:t.red,fontSize:13,marginBottom:10,fontWeight:600}}>{msg}</p>}

        <button onClick={create} disabled={saving}
          style={{padding:'12px 28px',background:`linear-gradient(135deg,${t.blue},${t.purple})`,border:'none',borderRadius:12,color:'#fff',fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'Space Grotesk,sans-serif',fontSize:14,boxShadow:`0 4px 16px ${t.blue}33`}}>
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
function PerformanceTab({t}) {
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
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Strategy Performance</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:5}}>Win rates and P&L per strategy — based on your closed trades</p>
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


function TickerBar({mkt, t, setTab, isConn}) {
  const syms = ['NIFTY','BANKNIFTY','SENSEX','BTC','ETH','SOL']
  return (
    <div style={{background:t.tickBg,borderBottom:`1px solid ${t.border}`,padding:'9px 28px',display:'flex',gap:28,overflowX:'auto',alignItems:'center'}}>
      {syms.map(sym => {
        const d = mkt[sym]
        const up = (d?.pct||0) >= 0
        const pctStr = d ? (up ? '+' : '') + fmt(d.pct, 2) + '%' : ''
        return (
          <div key={sym} onClick={() => setTab('charts')} style={{display:'flex',gap:10,alignItems:'center',flexShrink:0,cursor:'pointer'}}>
            <span style={{color:t.muted,fontSize:11,fontWeight:700}}>{sym}</span>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,color:t.text,fontWeight:700}}>{d ? fmt(d.price) : '—'}</span>
            {d && <span style={{fontSize:11,fontWeight:700,color:up?t.green:t.red,background:(up?t.green:t.red)+'18',borderRadius:6,padding:'1px 6px'}}>{pctStr}</span>}
          </div>
        )
      })}
      <span style={{marginLeft:'auto',fontSize:10,color:t.muted,flexShrink:0,display:'flex',alignItems:'center',gap:4}}>
        <span style={{width:5,height:5,borderRadius:'50%',background:isConn?t.green:t.amber,display:'inline-block'}} />
        {isConn ? 'Live · Kite' : 'Delayed · Yahoo'}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const router=useRouter()
  const [dark,setDark]=useState(true),[at,setAt]=useState(''),[kiteUser,setKU]=useState(null),[mkt,setMkt]=useState({}),[tab,setTab]=useState('signals'),[time,setTime]=useState(''),[tr,setTr]=useState(0),[loginUrl,setLoginUrl]=useState('')
  const t = dark ? DARK : LIGHT

  useEffect(()=>{
    if(!localStorage.getItem('pz_token')){router.push('/');return}
    const sd=localStorage.getItem('pz_dark');if(sd!==null)setDark(sd==='true')
    const a=localStorage.getItem('kite_access_token'),u=localStorage.getItem('kite_user'),d=localStorage.getItem('kite_connected_date')
    if(a&&d===new Date().toDateString()){setAt(a);if(u)setKU(JSON.parse(u))}
    else ['kite_access_token','kite_user','kite_connected_date'].forEach(k=>localStorage.removeItem(k))
    fetch('/api/kite-login').then(r=>r.json()).then(d=>setLoginUrl(d.loginUrl))
    const tick=()=>setTime(new Date().toLocaleTimeString('en-IN',{hour12:true,timeZone:'Asia/Kolkata'})+' IST')
    tick();const ti=setInterval(tick,1000);return()=>clearInterval(ti)
  },[])

  function toggleDark(){const nd=!dark;setDark(nd);localStorage.setItem('pz_dark',String(nd))}

  useEffect(()=>{fetchMkt();const ti=setInterval(fetchMkt,15000);return()=>clearInterval(ti)},[at])

  async function fetchMkt(){
    try{
      if(at){const r=await fetch('/api/kite-pro?action=quote&instruments=NSE:NIFTY+50,NSE:NIFTY+BANK,BSE:SENSEX',{headers:{'x-kite-access-token':at}});const d=await r.json();if(d.data){const m={},km={'NIFTY 50':'NIFTY','NIFTY BANK':'BANKNIFTY','SENSEX':'SENSEX'};Object.entries(d.data).forEach(([k,v])=>{const s=km[k.split(':')[1]]||k.split(':')[1];m[s]={price:v.last_price,change:v.net_change,pct:v.change}});setMkt(m);return}}
      const r=await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,BTC');const d=await r.json();if(d.data)setMkt(d.data)
    }catch{}
    // Fetch Binance crypto prices (public, no auth needed)
    try {
      const cr = await fetch('/api/binance?action=prices')
      const cd = await cr.json()
      if (cd.prices) {
        setMkt(prev => ({...prev, ...cd.prices}))
      }
    } catch {}
  }

  function disc(){['kite_access_token','kite_user','kite_connected_date'].forEach(k=>localStorage.removeItem(k));setAt('');setKU(null)}

  const tabs=[{id:'signals',l:'📡 Signals'},{id:'crypto',l:'🪙 Crypto'},{id:'positions',l:'💼 Portfolio'},{id:'trades',l:'📋 History'},{id:'charts',l:'📈 Charts'},{id:'alerts',l:'🔔 Alerts'},{id:'performance',l:'🏆 Performance'}]
  const isConn=!!at

  return (
    <>
      <Head>
        <title>Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:t.bg,fontFamily:'Space Grotesk,sans-serif',color:t.text,transition:'background 0.3s'}}>
        {dark&&<><div style={{position:'fixed',top:-150,left:-150,width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(59,158,255,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/><div style={{position:'fixed',bottom:-150,right:-150,width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(167,139,250,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/></>}

        <header style={{background:dark?'rgba(11,14,22,0.9)':'rgba(255,255,255,0.9)',backdropFilter:'blur(16px)',borderBottom:`1px solid ${t.border}`,padding:'0 28px',display:'flex',alignItems:'center',justifyContent:'space-between',height:64,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:38,height:38,borderRadius:12,background:'linear-gradient(135deg,#3b9eff,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:14,color:'#fff',boxShadow:'0 0 24px rgba(59,158,255,0.35)'}}>P0</div>
            <div><span style={{fontWeight:900,fontSize:17,color:t.text}}>Projectzero</span><span style={{color:t.muted,fontSize:11,marginLeft:8}}>FHP228</span></div>
            <Badge color={t.purple}>Connect</Badge>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{color:t.muted,fontSize:11,fontFamily:'JetBrains Mono,monospace'}}>{time}</span>
            <button onClick={()=>router.push('/ai')} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 14px',background:t.purple+'22',border:`1px solid ${t.purple}44`,borderRadius:20,cursor:'pointer',fontSize:13,color:t.purple,fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>🤖 AI</button>
            <button onClick={toggleDark} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'5px 14px',cursor:'pointer',fontSize:13,color:t.text,fontFamily:'Space Grotesk,sans-serif',fontWeight:500}}>{dark?'☀️ Light':'🌙 Dark'}</button>
            {isConn
              ? <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:7,background:t.green+'15',border:`1px solid ${t.green}33`,borderRadius:10,padding:'6px 14px'}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:t.green,display:'inline-block',animation:'pulse 1.5s infinite'}}/>
                    <span style={{color:t.green,fontSize:12,fontWeight:700}}>Zerodha Live</span>
                    {kiteUser&&<span style={{color:t.green+'55',fontSize:11}}>· {kiteUser.user_id}</span>}
                  </div>
                  <button onClick={disc} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:11,padding:'6px 10px',fontFamily:'Space Grotesk,sans-serif'}}>Disconnect</button>
                </div>
              : <button onClick={()=>loginUrl&&window.location.assign(loginUrl)} style={{display:'flex',alignItems:'center',gap:7,padding:'9px 18px',background:'linear-gradient(135deg,#ff4466,#ff6688)',border:'none',borderRadius:10,cursor:'pointer',color:'#fff',fontSize:13,fontFamily:'Space Grotesk,sans-serif',fontWeight:700,boxShadow:'0 4px 20px rgba(255,68,102,0.4)'}}>🔐 Login with Zerodha</button>
            }
            <button onClick={()=>{localStorage.removeItem('pz_token');router.push('/')}} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:12,padding:'4px 8px'}}>Logout</button>
          </div>
        </header>

        <TickerBar mkt={mkt} t={t} setTab={setTab} isConn={isConn} />

        <div style={{padding:'18px 28px 0',display:'flex',gap:4}}>
          {tabs.map(tb=><button key={tb.id} onClick={()=>setTab(tb.id)} style={{padding:'9px 20px',borderRadius:'10px 10px 0 0',fontSize:13,fontWeight:600,background:tab===tb.id?t.card:t.surface+'88',border:`1px solid ${tab===tb.id?t.border:'transparent'}`,borderBottom:tab===tb.id?`1px solid ${t.card}`:'none',color:tab===tb.id?t.text:t.muted,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',transition:'all 0.15s'}}>{tb.l}</button>)}
        </div>

        <main style={{padding:'0 28px 60px',maxWidth:1440,margin:'0 auto',position:'relative',zIndex:1}}>
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:'0 16px 16px 16px',padding:28}}>
            {!isConn&&tab!=='charts'&&<div style={{background:dark?t.blue+'0d':t.blue+'0a',border:`1px solid ${t.blue}33`,borderRadius:16,padding:18,marginBottom:24,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}><div><p style={{color:t.blue,fontWeight:700,fontSize:14}}>🔐 Login with Zerodha for live data & 1-click execution</p><p style={{color:t.muted,fontSize:12,marginTop:3}}>Live prices · Real positions · Auto stop loss · SL + Target in one click</p></div><button onClick={()=>loginUrl&&window.location.assign(loginUrl)} style={{padding:'10px 22px',background:`linear-gradient(135deg,${t.green},${t.teal})`,border:'none',borderRadius:12,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif',flexShrink:0,boxShadow:`0 4px 20px ${t.green}33`}}>Connect Now →</button></div>}

            {tab==='signals'&&<div><div style={{marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Live Signals</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>8 PZ strategies · ORB, Momentum, Supertrend, VWAP, Bollinger, MACD</p></div></div><MarketRegimeBanner t={t}/><NewsBar t={t} market='india'/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(370px,1fr))',gap:20,marginTop:20}}>{PZ_STRATEGIES.map(s=><SignalCard key={s.id} strat={s} at={at} onTrade={()=>setTr(r=>r+1)} t={t}/>)}</div></div>}
            {tab==='crypto'&&<CryptoTab t={t} />}
            {tab==='alerts'&&<AlertsTab t={t}/>}
            {tab==='performance'&&<PerformanceTab t={t}/>}
            {tab==='positions'&&<div><div style={{marginBottom:22}}><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Portfolio</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>Live from Zerodha · Positions · Available Margin · Today's Orders</p></div><Positions at={at} t={t}/></div>}
            {tab==='trades'&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}><div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Trade History</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>All trades · Entry/Exit · P&L</p></div><button onClick={()=>setTr(r=>r+1)} style={{padding:'8px 16px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>🔄 Refresh</button></div><History refresh={tr} t={t}/></div>}
            {tab==='charts'&&<Charts t={t} at={at}/>}
          </div>
        </main>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#374151;border-radius:2px}`}</style>
    </>
  )
}
