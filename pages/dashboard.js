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
          <button onClick={()=>setLive(v=>!v)} style={{padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:700,background:live?t.green+'22':t.surface,border:`1px solid ${live?t.green:t.border}`,color:live?t.green:t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
            {live?`⚡ Auto (${cfg.refresh}s)`:'⏸ Paused'}
          </button>
          <button onClick={()=>loadData()} style={{padding:'3px 8px',borderRadius:6,fontSize:13,background:'none',border:`1px solid ${t.border}`,color:t.muted,cursor:'pointer'}}>↻</button>
          {KITE_SEARCH[symbol]&&<button onClick={()=>window.open(`/chart?symbol=${symbol}&market=crypto`,'_blank','width=1440,height=860')} style={{padding:'3px 10px',borderRadius:6,fontSize:11,background:'none',border:`1px solid ${t.border}`,color:t.blue,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:600}}>Kite ↗</button>}
        </div>
      </div>
      {/* Row 2: interval selector */}
      <div style={{padding:'8px 14px',display:'flex',gap:4,flexWrap:'wrap',borderBottom:`1px solid ${t.border}`,background:t.surface+'55'}}>
        {INTERVALS.map(i=>(
          <button key={i.v} onClick={()=>setIntv(i.v)} style={{padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:700,background:intv===i.v?t.accentC:t.surface,border:`1px solid ${intv===i.v?t.accentC:t.border}`,color:intv===i.v?'#fff':t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all 0.1s'}}>{i.l}</button>
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

  async function paperTrade() {
    // Save a simulated trade to history without placing a real order
    setPlacing(true)
    try {
      const r = await fetch('/api/trades', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          symbol: sym, direction: data.signal, quantity: qty,
          entry_price: data.price, stop_loss: data.stopLoss,
          target: data.target, strategy: strat.name,
          notes: '📝 PAPER TRADE (simulated — no real order placed)',
          status: 'OPEN', market: 'india',
        })
      })
      const d = await r.json()
      if (d.id || d.trade?.id) {
        setResult({ok:true, msg:`📝 Paper trade saved! Track it in History tab. Entry: ₹${data.price}`})
        setTimeout(() => { onDone && onDone() }, 2500)
      } else {
        setResult({ok:false, msg:'Could not save paper trade: ' + (d.error||'unknown error')})
      }
    } catch(e) {
      setResult({ok:false, msg:'Error: ' + e.message})
    }
    setPlacing(false)
  }

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
              <select value={prod} onChange={e=>setProd(e.target.value)} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:12,padding:'8px 10px',fontFamily:'Inter,sans-serif',width:'100%'}}>
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
            <button onClick={onClose} style={{padding:'8px 28px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10}}>
            <button onClick={place} disabled={placing} style={{
              padding:17,border:'none',borderRadius:14,
              background: placing ? t.surface : data.signal==='BUY'
                ? `linear-gradient(135deg,${t.green},${t.teal})`
                : `linear-gradient(135deg,${t.red},#ff6688)`,
              color: placing ? t.muted : '#fff',
              fontWeight:800,fontSize:15,
              cursor: placing?'not-allowed':'pointer',
              fontFamily:'Inter,sans-serif',
              boxShadow: !placing ? `0 4px 24px ${sc}44` : 'none',
            }}>
              {!at ? '⚠️ Login first' : placing ? '⏳ Placing...' : `⚡ ${data.signal} + SL + Target`}
            </button>
            <button onClick={paperTrade} title="Paper trade — save without real money"
              style={{padding:'10px 16px',border:`1.5px solid ${t.border}`,borderRadius:14,background:t.surface,color:t.muted,cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'Inter,sans-serif'}}>
              📝 Paper
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SignalCard({strat,at,onTrade,t,aiMode='smart'}) {
  const [sym,setSym]=useState(strat.symbols[0]),[data,setData]=useState(null),[loading,setLoading]=useState(false),[modal,setModal]=useState(false),[chart,setChart]=useState(false)
  useEffect(()=>{
    load()
    // Auto-refresh every 5 minutes during market hours
    const iv = setInterval(()=>{
      const now = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}))
      const h=now.getHours(),m=now.getMinutes(),day=now.getDay()
      const isOpen = day>=1&&day<=5&&(h*60+m)>=555&&(h*60+m)<=930
      if(isOpen) load()
    }, 5*60*1000)
    return ()=>clearInterval(iv)
  },[sym,strat.id])
  const [aiNote,   setAiNote]   = useState('')
  const [aiLoading,setAiLoading]= useState(false)
  const [mtf,      setMtf]      = useState(null)
  const [deepDive, setDeepDive] = useState(null)
  const [deepLoading, setDeepLoading] = useState(false)

  async function fetchDeepDive() {
    if(deepLoading) return
    setDeepLoading(true); setDeepDive({news:[]})
    try{
      const r=await fetch(`/api/asset-deep-dive?symbol=${sym}&market=india`)
      const d=await r.json()
      if(d.status==='success') setDeepDive(d)
    }catch{}
    setDeepLoading(false)
  }

  async function load(){
    setLoading(true);setData(null);setMtf(null)
    try{
      const r=await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`)
      const d=await r.json()
      setData(d)
      if(d.signal!=='HOLD'){
        fetchMTF()
        if(aiMode==='full') fetchAI(d)
        // Auto-log signal to history DB
        fetch('/api/signal-history',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({symbol:sym,strategy:strat.name,signal:d.signal,
            confidence:d.confidence,price:d.price,stopLoss:d.stopLoss,
            target:d.target,rr:d.rr,rsi:d.indicators?.rsi,market:'india',reason:d.reason})
        }).catch(()=>{})
      } else setAiNote('')
    }catch(e){console.warn('Signal:',e.message)}
    setLoading(false)
  }

  async function fetchMTF(){
    try{
      const r=await fetch(`/api/multi-timeframe?symbol=${sym}&market=india`)
      const d=await r.json()
      if(d.status==='success') setMtf(d)
    }catch{}
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
          {data&&!loading&&<div style={{background:sc+'18',border:`1.5px solid ${sc}55`,borderRadius:8,padding:'5px 12px',color:sc,fontWeight:800,fontSize:13,letterSpacing:'0.05em',flexShrink:0}}>{data.signal}</div>}
        </div>

        <div style={{display:'flex',gap:6}}>
          {strat.symbols.map(s=><button key={s} onClick={()=>setSym(s)} style={{padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:700,background:sym===s?t.accentC+'22':t.surface,border:`1.5px solid ${sym===s?t.accentC:t.border}`,color:sym===s?t.accentC:t.muted,cursor:'pointer',fontFamily:'Inter,sans-serif',transition:'all 0.15s'}}>{s}</button>)}
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
          {aiMode!=='off'&&data&&data.signal!=='HOLD'&&!aiNote&&!aiLoading&&(
            <button onClick={()=>fetchAI(data)}
              style={{padding:'7px 14px',background:t.purple+'11',border:`1px solid ${t.purple}33`,borderRadius:8,color:t.purple,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'Inter,sans-serif',width:'100%',textAlign:'center'}}>
              🤖 Ask Claude AI
            </button>
          )}
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

          {/* Multi-Timeframe Confluence */}
          {mtf&&(
            <div style={{background:t.surface,borderRadius:12,padding:'12px 14px',border:`1px solid ${mtf.color}44`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>🔀 MULTI-TIMEFRAME</span>
                <span style={{color:mtf.color,fontWeight:800,fontSize:11,background:mtf.color+'18',padding:'2px 8px',borderRadius:20,border:`1px solid ${mtf.color}44`}}>{mtf.confluence} ({mtf.score}/3)</span>
              </div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                {Object.entries(mtf.timeframes||{}).map(([tf,d])=>(
                  <div key={tf} style={{flex:1,background:t.card,borderRadius:8,padding:'8px',textAlign:'center',border:`1px solid ${d.trend==='BULLISH'?t.green:d.trend==='BEARISH'?t.red:t.border}33`}}>
                    <p style={{color:t.muted,fontSize:9,fontWeight:700,marginBottom:3}}>{d.label}</p>
                    <p style={{color:d.trend==='BULLISH'?t.green:d.trend==='BEARISH'?t.red:t.amber,fontSize:14,fontWeight:900,lineHeight:1}}>{d.trend==='BULLISH'?'▲':d.trend==='BEARISH'?'▼':'⟃'}</p>
                    <p style={{color:t.muted,fontSize:9,marginTop:2}}>RSI {d.rsi}</p>
                  </div>
                ))}
              </div>
              <p style={{color:t.text2,fontSize:11,lineHeight:1.6}}>{mtf.recommendation}</p>
            </div>
          )}

          
          {/* Deep Dive Panel */}
          {(deepDive||deepLoading)&&(
            <div style={{background:t.surface,borderRadius:12,padding:'14px 16px',border:`1px solid ${t.purple}44`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <span style={{fontSize:14}}>🔬</span>
                <span style={{color:t.purple,fontSize:11,fontWeight:700,letterSpacing:'0.08em'}}>DEEP DIVE — {sym}</span>
                {deepLoading&&<div style={{width:10,height:10,border:`2px solid ${t.purple}44`,borderTopColor:t.purple,borderRadius:'50%',animation:'spin 0.8s linear infinite',marginLeft:'auto'}}/>}
              </div>
              {deepLoading
                ?<p style={{color:t.muted,fontSize:12,fontStyle:'italic'}}>Fetching {sym} data, news, global context...</p>
                :<>
                  <p style={{color:t.text2,fontSize:12,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{deepDive?.analysis}</p>
                  {deepDive?.news?.length>0&&(
                    <div style={{marginTop:10,borderTop:`1px solid ${t.border}`,paddingTop:8}}>
                      <p style={{color:t.muted,fontSize:10,fontWeight:700,marginBottom:6}}>RECENT NEWS</p>
                      {deepDive.news.slice(0,4).map((n,i)=>(
                        <p key={i} style={{color:t.muted,fontSize:11,marginBottom:4}}>• [{n.timeAgo}] {n.title?.slice(0,90)}</p>
                      ))}
                    </div>
                  )}
                </>
              }
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            <button onClick={()=>{setDeepDive(null);fetchDeepDive()}} disabled={deepLoading}
              style={{padding:'10px',background:deepDive?t.purple+'22':t.surface,border:`1.5px solid ${deepDive?t.purple:t.border}`,borderRadius:10,color:deepDive?t.purple:t.muted,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'Inter,sans-serif'}}>
              {deepLoading?'⏳...':'🔬 Deep Dive'}
            </button>
            <button onClick={()=>setChart(!chart)}
              style={{padding:'10px',background:t.surface,border:`1.5px solid ${chart?t.blue:t.border}`,borderRadius:10,color:t.blue,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'Inter,sans-serif'}}>
              {chart?'✕ Chart':'📈 Chart'}
            </button>
            <button onClick={()=>setModal(true)} disabled={data.signal==='HOLD'}
              style={{padding:'10px',border:'none',borderRadius:10,fontWeight:800,fontSize:11,cursor:data.signal==='HOLD'?'not-allowed':'pointer',background:data.signal==='HOLD'?t.surface:data.signal==='BUY'?`linear-gradient(135deg,${t.green},${t.teal})`:`linear-gradient(135deg,${t.red},#ff6688)`,color:data.signal==='HOLD'?t.muted:'#fff',fontFamily:'Inter,sans-serif',opacity:data.signal==='HOLD'?0.5:1}}>
              {data.signal==='HOLD'?'Hold':'⚡ '+data.signal}
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
      {!loading&&trades.length===0&&<div style={{textAlign:'center',padding:50,background:t.surface,borderRadius:16,border:`1px solid ${t.border}`}}><p style={{fontSize:40,marginBottom:10}}>📋</p><p style={{color:t.text,fontWeight:700}}>No trades yet</p><p style={{color:t.muted,fontSize:13,marginTop:4}}>Execute a signal to start</p></div>}
      {!loading&&trades.length>0&&<div style={{overflowX:'auto',borderRadius:16,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Date','Symbol','Strategy','Dir','Qty','Entry','Exit','P&L','Status',''].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead><tbody>{trades.map((x,i)=>{const pc=clr(x.pnl||0,t),date=new Date(x.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});return <tr key={x.id} style={{borderBottom:`1px solid ${t.border}22`,background:i%2?t.surface+'44':'transparent'}}><td style={{padding:'12px 16px',color:t.muted,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{x.symbol}</td><td style={{padding:'12px 16px',color:t.muted,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.strategy}</td><td style={{padding:'12px 16px'}}><Badge color={x.direction==='BUY'?t.green:t.red}>{x.direction}</Badge></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(x.entry_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{x.exit_price?`₹${fmt(x.exit_price)}`:'—'}</td><td style={{padding:'12px 16px',color:pc,fontWeight:800,fontFamily:'monospace'}}>{x.pnl!=null?`${x.pnl>=0?'+':''}₹${fmt(x.pnl)}`:'—'}</td><td style={{padding:'12px 16px'}}><Badge color={x.status==='OPEN'?t.amber:x.status==='CLOSED'?t.green:t.red}>{x.status}</Badge></td><td style={{padding:'12px 16px'}}>{x.status==='OPEN'&&<button onClick={()=>close(x.id,x.entry_price,x.direction,x.symbol,x.strategy)} style={{padding:'5px 12px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif',fontWeight:600}}>Close</button>}</td></tr>})}</tbody></table></div>}
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
  const getDefaultQty = () => {
    if(sym==='BTC')  return 0.001
    if(sym==='ETH')  return 0.01
    if(sym==='BNB')  return 0.01
    if(sym==='XRP')  return 1
    if(sym==='DOGE') return 10
    return 0.1
  }
  const [qty, setQty] = useState(() => getDefaultQty())
  const QTY_STEP = sym==='BTC'?0.001:sym==='ETH'?0.01:sym==='BNB'?0.01:sym==='XRP'?1:sym==='DOGE'?10:0.1
  const [placing, setPlacing]= useState(false)
  const [result,  setResult] = useState(null)
  const [sl,      setSl]     = useState(true)
  const [tgt,     setTgt]    = useState(true)

  const sc     = data.signal==='BUY' ? t.green : t.red
  const risk   = data.stopLoss ? Math.abs(data.price - data.stopLoss)*qty : null
  const reward = data.target   ? Math.abs(data.target - data.price)*qty   : null
  const rr     = risk && reward ? (reward/risk).toFixed(1) : null

  async function cryptoPaperTrade() {
    setPlacing(true)
    try {
      const r = await fetch('/api/trades', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          symbol, direction:data.signal, quantity:qty,
          entry_price:data.price, stop_loss:data.stopLoss, target:data.target,
          strategy, notes:'📝 PAPER TRADE (simulated — no real Binance order)',
          market:'crypto', status:'OPEN',
        })
      })
      const d = await r.json()
      if (d.trade?.id || d.id) {
        setResult({ok:true, msg:`📝 Paper trade saved! $${data.price} entry. Track in History tab.`})
        setTimeout(()=>{onDone&&onDone()}, 2500)
      } else setResult({ok:false, msg:'Could not save: '+(d.error||'unknown')})
    } catch(e) { setResult({ok:false, msg:e.message}) }
    setPlacing(false)
  }

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
              <span style={{color:t.muted,fontSize:11}}>≈ ${(qty*data.price) < 1 ? (qty*data.price).toFixed(4) : (qty*data.price).toFixed(2)} USDT</span>
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
                  <p style={{color:t.blue,fontSize:15,fontWeight:800,fontFamily:'monospace'}}>{entryAmt < 1 ? '$'+entryAmt.toFixed(4) : fmtD(entryAmt)}</p>
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
            <button onClick={onClose} style={{padding:'8px 28px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10}}>
            <button onClick={place} disabled={placing} style={{
              padding:17,border:'none',borderRadius:14,
              background: placing ? t.surface : data.signal==='BUY'
                ? `linear-gradient(135deg,${t.green},${t.teal})`
                : `linear-gradient(135deg,${t.red},#ff6688)`,
              color: placing?t.muted:'#fff',
              fontWeight:800,fontSize:14,cursor:placing?'not-allowed':'pointer',
              fontFamily:'Inter,sans-serif',
              boxShadow:!placing?`0 4px 24px ${sc}44`:'none',
            }}>
              {placing?'⏳ Placing...':`⚡ ${data.signal} ${qty} ${sym}`}
            </button>
            <button onClick={cryptoPaperTrade} title="Paper trade"
              style={{padding:'10px 16px',border:`1.5px solid ${t.border}`,borderRadius:14,background:t.surface,color:t.muted,cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'Inter,sans-serif'}}>
              📝
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Crypto Signal Card ─────────────────────────────────────────
function CryptoSignalCard({symbol, strategy, stratName, t, aiMode='smart'}) {
  const [data,     setData]    = useState(null)
  const [loading,  setLoading] = useState(false)
  const [modal,    setModal]   = useState(false)
  const [aiNote,   setAiNote]  = useState('')
  const [aiLoading,setAiLoading] = useState(false)

  useEffect(() => {
    // Stagger loads to avoid hitting API rate limits (8 cards load simultaneously)
    const symbols = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA']
    const delay   = symbols.indexOf(symbol) * 500  // 500ms stagger per card
    const timer   = setTimeout(() => load(), delay)
    
    const iv = setInterval(() => load(), 3*60*1000)  // refresh every 3 min
    return () => { clearTimeout(timer); clearInterval(iv) }
  }, [symbol, strategy])

  const [mtf,          setMtf]          = useState(null)
  const [cryptoDeep,   setCryptoDeep]   = useState(null)
  const [cryptoDeepLoad,setCryptoDeepLoad] = useState(false)

  async function fetchCryptoDeep() {
    if(cryptoDeepLoad) return
    setCryptoDeepLoad(true); setCryptoDeep({news:[]})
    try{
      const r=await fetch(`/api/asset-deep-dive?symbol=${symbol}&market=crypto`)
      const d=await r.json()
      if(d.status==='success') setCryptoDeep(d)
    }catch{}
    setCryptoDeepLoad(false)
  }

  async function load() {
    setLoading(true); setData(null)
    try {
      const r = await fetch(`/api/crypto-signals?symbol=${symbol}&strategy=${strategy}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      if (d && d.signal) {
        setData(d)
        if (d.signal !== 'HOLD' && d.confidence >= 50) {
          setTimeout(() => fetchMTF(), 1000)
          if(aiMode==='full') setTimeout(() => fetchAI(d), 2000)
          // Log signal to history
          fetch('/api/signal-history',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({symbol,strategy,signal:d.signal,confidence:d.confidence,
              price:d.price,stopLoss:d.stopLoss,target:d.target,rr:d.rr,market:'crypto'})
          }).catch(()=>{})
        }
      }
    } catch(e) {
      console.warn('Crypto signal load error:', e.message)
    }
    setLoading(false)
  }

  async function fetchMTF() {
    try {
      const r = await fetch(`/api/multi-timeframe?symbol=${symbol}&market=crypto`)
      const d = await r.json()
      if (d.status === 'success') setMtf(d)
    } catch {}
  }

  async function fetchAI(d) {
    setAiLoading(true); setAiNote('')
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
    setAiLoading(false)
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

      <div className="card-enter" style={{
        background:t.card,
        borderRadius:16,
        padding:20,
        border:`1px solid ${t.border}`,
        display:'flex',flexDirection:'column',gap:12,
        boxShadow:'0 2px 12px rgba(0,0,0,0.15)',
        transition:'box-shadow 0.2s,border-color 0.2s',
      }}>

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
              <div style={{background:sc+'18',border:`1.5px solid ${sc}55`,borderRadius:8,padding:'5px 12px',color:sc,fontWeight:800,fontSize:13,letterSpacing:'0.05em'}}>{data.signal}</div>
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

          {/* Multi-Timeframe */}
          {mtf&&(
            <div style={{background:t.surface,borderRadius:12,padding:'12px 14px',border:`1px solid ${mtf.color}44`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.08em'}}>🔀 MULTI-TIMEFRAME</span>
                <span style={{color:mtf.color,fontWeight:800,fontSize:11,background:mtf.color+'18',padding:'2px 8px',borderRadius:20}}>{mtf.confluence} ({mtf.score}/3)</span>
              </div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                {Object.entries(mtf.timeframes||{}).map(([tf,d])=>(
                  <div key={tf} style={{flex:1,background:t.card,borderRadius:8,padding:'8px',textAlign:'center',border:`1px solid ${d.trend==='BULLISH'?t.green:d.trend==='BEARISH'?t.red:t.border}33`}}>
                    <p style={{color:t.muted,fontSize:9,fontWeight:700,marginBottom:3}}>{d.label}</p>
                    <p style={{color:d.trend==='BULLISH'?t.green:d.trend==='BEARISH'?t.red:t.amber,fontSize:14,fontWeight:900}}>{d.trend==='BULLISH'?'▲':d.trend==='BEARISH'?'▼':'⟃'}</p>
                    <p style={{color:t.muted,fontSize:9,marginTop:2}}>RSI {d.rsi}</p>
                  </div>
                ))}
              </div>
              <p style={{color:t.text2,fontSize:11,lineHeight:1.6}}>{mtf.recommendation}</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button
              onClick={()=>window.open(`/chart?symbol=${symbol}&market=crypto`,'_blank','width=1440,height=860')}
              style={{padding:'11px',background:t.surface,border:`1.5px solid ${t.border}`,borderRadius:10,color:t.amber,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'Inter,sans-serif'}}
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
                fontFamily:'Inter,sans-serif',
                opacity:data.signal==='HOLD'?0.5:1,
                boxShadow:data.signal!=='HOLD'?`0 2px 12px ${sc}44`:'none',
              }}
            >
              {data.signal==='HOLD'?'Hold — No Signal':`⚡ ${data.signal} on Binance`}
            </button>
          </div>

          {/* Crypto Deep Dive Panel */}
          {(cryptoDeep||cryptoDeepLoad)&&(
            <div style={{background:'#120d1f',borderRadius:12,padding:'14px 16px',border:`1px solid ${t.purple}44`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <span>🔬</span>
                <span style={{color:t.purple,fontSize:11,fontWeight:700,letterSpacing:'0.08em'}}>DEEP DIVE — {symbol}</span>
                {cryptoDeepLoad&&<div style={{width:10,height:10,border:`2px solid ${t.purple}44`,borderTopColor:t.purple,borderRadius:'50%',animation:'spin 0.8s linear infinite',marginLeft:'auto'}}/>}
              </div>
              {cryptoDeepLoad
                ?<p style={{color:t.muted,fontSize:12,fontStyle:'italic'}}>Fetching {symbol} data, news, global context...</p>
                :<>
                  <p style={{color:t.text2,fontSize:12,lineHeight:1.8,whiteSpace:'pre-wrap'}}>{cryptoDeep?.analysis}</p>
                  {cryptoDeep?.news?.length>0&&(
                    <div style={{marginTop:10,borderTop:`1px solid ${t.border}`,paddingTop:8}}>
                      <p style={{color:t.muted,fontSize:10,fontWeight:700,marginBottom:6}}>RECENT NEWS</p>
                      {cryptoDeep.news.slice(0,4).map((n,i)=>(
                        <p key={i} style={{color:t.muted,fontSize:11,marginBottom:4}}>• [{n.timeAgo}] {n.title?.slice(0,90)}</p>
                      ))}
                    </div>
                  )}
                </>
              }
            </div>
          )}
        </>}
      </div>
    </>
  )
}


// ── Crypto Tab ─────────────────────────────────────────────────
function CryptoTab({t, at, aiMode='smart'}) {
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
            aiMode={aiMode}
          />
        ))}
      </div>

      {/* Crypto News */}
      <div style={{marginTop:20}}>
        <NewsBar t={t} market='crypto'/>
      </div>

      {/* Info bar */}
      <div style={{marginTop:12,background:t.surface,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
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


// ── Options Chain Tab ──────────────────────────────────────────
function OptionsTab({t}) {
  const [symbol,  setSymbol]  = useState('NIFTY')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(()=>{ load() }, [symbol])

  async function load() {
    setLoading(true); setError(''); setData(null)
    try {
      const r = await fetch(`/api/options-chain?symbol=${symbol}`)
      const d = await r.json()
      if (d.status==='success') setData(d)
      else setError(d.error || 'Failed to load options chain')
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
          {['NIFTY','BANKNIFTY'].map(s=>(
            <button key={s} onClick={()=>setSymbol(s)}
              style={{padding:'8px 20px',borderRadius:10,border:`1px solid ${symbol===s?t.blue:t.border}`,background:symbol===s?t.blue+'22':t.surface,color:symbol===s?t.blue:t.muted,fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              {s}
            </button>
          ))}
          <button onClick={load} style={{padding:'8px 14px',borderRadius:10,border:`1px solid ${t.border}`,background:t.surface,color:t.muted,cursor:'pointer',fontSize:13}}>↻</button>
        </div>
      </div>

      {loading&&<div style={{textAlign:'center',padding:40}}><div style={{width:32,height:32,border:`3px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 12px'}}/><p style={{color:t.muted}}>Loading NSE options chain...</p></div>}

      {error&&(
        <div style={{background:t.red+'11',border:`1px solid ${t.red}33`,borderRadius:14,padding:24,textAlign:'center'}}>
          <p style={{fontSize:28,marginBottom:8}}>⚠️</p>
          <p style={{color:t.red,fontWeight:700,marginBottom:6}}>NSE Connection Issue</p>
          <p style={{color:t.muted,fontSize:13,marginBottom:16}}>{error}</p>
          <p style={{color:t.muted,fontSize:12}}>NSE blocks automated requests during market hours. Try again after 3:30 PM or outside market hours. The data is available on the NSE website directly.</p>
          <button onClick={()=>window.open(`https://www.nseindia.com/option-chain`,'_blank')} style={{marginTop:12,padding:'10px 24px',background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:10,color:t.blue,cursor:'pointer',fontWeight:700,fontFamily:'Inter,sans-serif'}}>Open NSE Options Chain ↗</button>
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


// ── Market Status Banner ───────────────────────────────────────
// ── Day-Based Strategy Hint ────────────────────────────────────
function DayStrategyHint({t}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const now = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}))
  const day = now.getDay()
  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]

  const hints = {
    1: { // Monday
      label: 'Weak Day', color: t.red,
      tip: 'Monday historically weakest day. Trade smaller size. Gap-Fade strategy works well if market gaps up.',
      focus: ['Gap & Fade','VWAP Reversion'],
      avoid: ['Tuesday Momentum (wrong day)','Swing shorts (wait for Tue)'],
    },
    2: { // Tuesday
      label: '📅 Best Day', color: t.green,
      tip: 'Tuesday avg +0.97% BankNifty. Best day for momentum. Tuesday Momentum strategy has highest win rate today.',
      focus: ['Tuesday Momentum ⭐','PZ-ORB Filter','Supertrend'],
      avoid: ['Gap & Fade (avoid fading strength)'],
    },
    3: { // Wednesday
      label: 'Good Day', color: t.green,
      tip: 'Wednesday second best day (+0.54% avg). Momentum strategies continue to work. Watch for trend continuation.',
      focus: ['Supertrend','MACD Crossover','VWAP'],
      avoid: ['Mean reversion on strong trends'],
    },
    4: { // Thursday
      label: 'Neutral', color: t.amber,
      tip: 'Thursday typically rangebound. Bollinger Band strategies work well. Be cautious of expiry volatility.',
      focus: ['Bollinger Bands','VWAP Reversion'],
      avoid: ['Holding positions overnight'],
    },
    5: { // Friday
      label: 'Flat/Down', color: t.amber,
      tip: 'Friday tends flat to slightly down. Reduce size. Avoid new overnight positions. Close MIS by 3:15.',
      focus: ['Gap & Fade','Bollinger Bands (if ranging)'],
      avoid: ['Tuesday Momentum','Swing positions'],
    },
  }

  const isWeekend = day === 0 || day === 6
  if (isWeekend) return null

  const hint = hints[day]
  if (!hint) return null

  return (
    <div style={{
      background:hint.color+'08',border:`1px solid ${hint.color}22`,
      borderRadius:12,padding:'12px 16px',marginBottom:14,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
        <span style={{fontWeight:700,color:hint.color,fontSize:13}}>{dow} — {hint.label}</span>
        <span style={{color:t.muted,fontSize:12,flex:1}}>{hint.tip}</span>
      </div>
      <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
        <div>
          <span style={{color:t.muted,fontSize:10,fontWeight:600}}>FOCUS: </span>
          {hint.focus.map(s=>(
            <span key={s} style={{background:t.green+'18',color:t.green,borderRadius:20,padding:'1px 8px',fontSize:11,fontWeight:600,marginRight:4,border:`1px solid ${t.green}22`}}>{s}</span>
          ))}
        </div>
        <div>
          <span style={{color:t.muted,fontSize:10,fontWeight:600}}>AVOID: </span>
          {hint.avoid.map(s=>(
            <span key={s} style={{background:t.red+'18',color:t.red,borderRadius:20,padding:'1px 8px',fontSize:11,fontWeight:600,marginRight:4,border:`1px solid ${t.red}22`}}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}


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
      // Fetch account + prices in parallel
      const [acctR, priceR] = await Promise.all([
        fetch('/api/binance?action=account'),
        fetch('/api/binance?action=prices'),
      ])
      const acctD  = await acctR.json()
      const priceD = await priceR.json()

      if (acctD.error) throw new Error(acctD.error)
      setAccount(acctD)
      setPrices(priceD.prices || {})
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
          <table style={{width:'100%',borderCollapse:'collapse'}}>
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
          </table>
        </div>
      )}
    </div>
  )
}


// ── Backtest Tab ───────────────────────────────────────────────
function BacktestTab({t}) {
  const [sym,     setSym]    = useState('NIFTY')
  const [strat,   setStrat]  = useState('supertrend')
  const [market,  setMkt]    = useState('india')
  const [period,  setPeriod] = useState('1year')
  const [result,  setResult] = useState(null)
  const [loading, setLoading]= useState(false)
  const [error,   setError]  = useState('')

  const INDIA_SYMS   = ['NIFTY','BANKNIFTY','SENSEX','TCS','INFY','RELIANCE','HDFCBANK','ICICIBANK','SBIN']
  const CRYPTO_SYMS  = ['BTC','ETH','SOL','BNB','XRP','DOGE']
  const INDIA_STRATS = ['supertrend','vwap','bollinger','macd']
  const CRYPTO_STRATS= ['momentum','macd-cross','rsi-reversal','bb-breakout']
  const syms   = market==='crypto'?CRYPTO_SYMS:INDIA_SYMS
  const strats = market==='crypto'?CRYPTO_STRATS:INDIA_STRATS

  async function run() {
    setLoading(true); setResult(null); setError('')
    try {
      const r = await fetch(`/api/backtest?symbol=${sym}&strategy=${strat}&market=${market}&period=${period}`)
      const d = await r.json()
      if (d.status==='success') setResult(d)
      else setError(d.error || 'Backtest failed')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const statColor = (v, threshold=0) => v > threshold ? t.green : v < threshold ? t.red : t.muted

  return (
    <div>
      <div style={{marginBottom:20}}>
        <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Strategy Backtest</h2>
        <p style={{color:t.muted,fontSize:13,marginTop:4}}>Test any strategy against real historical data. See win rate, P&L, and drawdown.</p>
      </div>

      {/* Config */}
      <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid ${t.border}`,marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:16}}>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:'0.06em'}}>MARKET</p>
            <select value={market} onChange={e=>{setMkt(e.target.value);setSym(e.target.value==='crypto'?'BTC':'NIFTY');setStrat(e.target.value==='crypto'?'momentum':'supertrend')}}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',width:'100%',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              <option value="india">🇮🇳 Indian</option>
              <option value="crypto">🪙 Crypto</option>
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:'0.06em'}}>SYMBOL</p>
            <select value={sym} onChange={e=>setSym(e.target.value)}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',width:'100%',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              {syms.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:'0.06em'}}>STRATEGY</p>
            <select value={strat} onChange={e=>setStrat(e.target.value)}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',width:'100%',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              {strats.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p style={{color:t.muted,fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:'0.06em'}}>PERIOD</p>
            <select value={period} onChange={e=>setPeriod(e.target.value)}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,padding:'8px 10px',width:'100%',fontSize:13,fontFamily:'Inter,sans-serif'}}>
              <option value="3months">3 Months</option>
              <option value="6months">6 Months</option>
              <option value="1year">1 Year</option>
            </select>
          </div>
        </div>
        <button onClick={run} disabled={loading}
          style={{padding:'11px 32px',background:loading?t.surface:'linear-gradient(135deg,#ff6600,#ff9500)',border:'none',borderRadius:10,color:loading?t.muted:'#fff',fontWeight:700,cursor:loading?'not-allowed':'pointer',fontFamily:'Inter,sans-serif',fontSize:14,boxShadow:loading?'none':'0 4px 16px #ff660033'}}>
          {loading?'Running backtest...':'▶ Run Backtest'}
        </button>
        {error&&<p style={{color:t.red,fontSize:13,marginTop:10,fontWeight:600}}>{error}</p>}
      </div>

      {/* Results */}
      {result&&(
        <>
          {/* Stats grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'WIN RATE',          v:`${result.stats.winRate}%`,         c:statColor(result.stats.winRate,50)},
              {l:'TOTAL TRADES',      v:result.stats.totalTrades,            c:t.text},
              {l:'WINS / LOSSES',     v:`${result.stats.wins} / ${result.stats.losses}`, c:t.text},
              {l:'AVG WIN',           v:`+${result.stats.avgWin}%`,          c:t.green},
              {l:'AVG LOSS',          v:`${result.stats.avgLoss}%`,          c:t.red},
              {l:'PROFIT FACTOR',     v:result.stats.profitFactor||'—',      c:statColor(result.stats.profitFactor,1)},
              {l:'MAX DRAWDOWN',      v:`-${result.stats.maxDrawdownPct}%`,  c:statColor(-result.stats.maxDrawdownPct,-20)},
              {l:'TOTAL P&L',         v:`${result.stats.totalPnlPct>0?'+':''}${result.stats.totalPnlPct}%`, c:statColor(result.stats.totalPnlPct)},
              {l:'EXPECTANCY/TRADE',  v:`${result.stats.expectancy>0?'+':''}${result.stats.expectancy}%`,  c:statColor(result.stats.expectancy)},
              {l:'FINAL EQUITY',      v:`₹${result.stats.finalEquity}`,      c:statColor(result.stats.finalEquity,100)},
            ].map(x=>(
              <div key={x.l} style={{background:t.card,borderRadius:12,padding:'14px',border:`1px solid ${t.border}`,textAlign:'center'}}>
                <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:'0.07em',marginBottom:6}}>{x.l}</p>
                <p style={{color:x.c,fontSize:16,fontWeight:800,fontFamily:'JetBrains Mono,monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          {/* Verdict */}
          <div style={{
            background: result.stats.winRate>=55&&result.stats.expectancy>0
              ? t.green+'0d' : result.stats.winRate<45
              ? t.red+'0d' : t.amber+'0d',
            border:`1px solid ${result.stats.winRate>=55&&result.stats.expectancy>0?t.green:result.stats.winRate<45?t.red:t.amber}44`,
            borderRadius:14,padding:18,marginBottom:20,
          }}>
            <p style={{fontWeight:800,fontSize:15,color:t.text,marginBottom:6}}>
              {result.stats.winRate>=55&&result.stats.expectancy>0?'✅ STRATEGY PASSES — Positive expectancy. Trade this.'
               :result.stats.winRate<45?'❌ STRATEGY FAILS — Negative expectancy on this period. Avoid.'
               :'⚠️ MARGINAL — borderline results. Use with caution.'}
            </p>
            <p style={{color:t.text2,fontSize:13}}>
              {sym} · {strat} · {period} · {result.dataPoints} trading days · Starting ₹100 → ₹{result.stats.finalEquity}
            </p>
          </div>

          {/* Best & worst trades */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
            {result.bestTrade&&(
              <div style={{background:t.green+'0a',borderRadius:12,padding:16,border:`1px solid ${t.green}33`}}>
                <p style={{color:t.green,fontSize:11,fontWeight:700,marginBottom:8}}>🏆 BEST TRADE</p>
                <p style={{color:t.text,fontWeight:800,fontSize:16,fontFamily:'JetBrains Mono,monospace'}}>+{result.bestTrade.pnlPct}%</p>
                <p style={{color:t.muted,fontSize:11,marginTop:4}}>{result.bestTrade.direction} · {result.bestTrade.entryDate} → {result.bestTrade.exitDate}</p>
              </div>
            )}
            {result.worstTrade&&(
              <div style={{background:t.red+'0a',borderRadius:12,padding:16,border:`1px solid ${t.red}33`}}>
                <p style={{color:t.red,fontSize:11,fontWeight:700,marginBottom:8}}>⚠️ WORST TRADE</p>
                <p style={{color:t.text,fontWeight:800,fontSize:16,fontFamily:'JetBrains Mono,monospace'}}>{result.worstTrade.pnlPct}%</p>
                <p style={{color:t.muted,fontSize:11,marginTop:4}}>{result.worstTrade.direction} · {result.worstTrade.entryDate} → {result.worstTrade.exitDate}</p>
              </div>
            )}
          </div>

          {/* Recent trades */}
          {result.recentTrades?.length>0&&(
            <div style={{background:t.card,borderRadius:14,border:`1px solid ${t.border}`,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,fontSize:11,fontWeight:700,color:t.muted,letterSpacing:'0.06em'}}>RECENT TRADES (last 10)</div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr style={{background:t.surface}}>
                  {['ENTRY DATE','EXIT DATE','DIRECTION','ENTRY','EXIT','P&L %','RESULT'].map(h=>(
                    <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:t.muted,letterSpacing:'0.06em',borderBottom:`1px solid ${t.border}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {result.recentTrades.map((tr,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}>
                      <td style={{padding:'9px 12px',color:t.muted,fontSize:12}}>{tr.entryDate}</td>
                      <td style={{padding:'9px 12px',color:t.muted,fontSize:12}}>{tr.exitDate}</td>
                      <td style={{padding:'9px 12px'}}><span style={{color:tr.direction==='BUY'?t.green:t.red,fontWeight:700,fontSize:11}}>{tr.direction}</span></td>
                      <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>{market==='crypto'?'$':'₹'}{tr.entry?.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                      <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontSize:12,color:t.text}}>{market==='crypto'?'$':'₹'}{tr.exit?.toLocaleString('en-IN',{maximumFractionDigits:2})}</td>
                      <td style={{padding:'9px 12px',fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:12,color:tr.pnlPct>=0?t.green:t.red}}>{tr.pnlPct>=0?'+':''}{tr.pnlPct}%</td>
                      <td style={{padding:'9px 12px'}}><span style={{color:tr.result==='WIN'?t.green:t.red,fontSize:11,fontWeight:700}}>{tr.result==='WIN'?'✅ WIN':'❌ LOSS'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        const pctStr = d && d.pct!=null ? (up ? '+' : '') + fmt(d.pct, 2) + '%' : ''
        return (
          <div key={sym} onClick={() => setTab('charts')} style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,cursor:'pointer',padding:'4px 10px',borderRadius:8,transition:'background 0.15s'}}
            onMouseEnter={e=>e.currentTarget.style.background=t.surface}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{color:t.muted,fontSize:10,fontWeight:600,letterSpacing:'0.04em'}}>{sym}</span>
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
  const [aiMode,setAiMode]=useState('smart')
  useEffect(()=>{const s=localStorage.getItem('pz_ai_mode');if(s)setAiMode(s)},[]) // load persisted AI mode
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

  useEffect(()=>{
    fetchMkt()
    // Refresh faster during market hours
    const getInterval = () => {
      const now = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}))
      const h=now.getHours(),m=now.getMinutes(),day=now.getDay()
      const isOpen = day>=1&&day<=5&&(h*60+m)>=555&&(h*60+m)<=930
      return isOpen ? 10000 : 30000  // 10s open, 30s closed
    }
    const ti = setInterval(fetchMkt, getInterval())
    return () => clearInterval(ti)
  }, [at])

  async function fetchMkt(){
    try{
      if(at){const r=await fetch('/api/kite-pro?action=quote&instruments=NSE:NIFTY+50,NSE:NIFTY+BANK,BSE:SENSEX',{headers:{'x-kite-access-token':at}});const d=await r.json();if(d.data){const m={},km={'NIFTY 50':'NIFTY','NIFTY BANK':'BANKNIFTY','SENSEX':'SENSEX'};Object.entries(d.data).forEach(([k,v])=>{const s=km[k.split(':')[1]]||k.split(':')[1];m[s]={price:v.last_price,change:v.net_change,pct:v.change}});setMkt(m);return}}
      const r=await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX');const d=await r.json();if(d.data)setMkt(d.data)
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

  // Keyboard shortcuts: 1-8 = tabs, R = refresh, D = dark mode
  useEffect(()=>{
    const handler = (e) => {
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return
      const tabKeys = {'1':'signals','2':'crypto','3':'positions','4':'trades','5':'charts','6':'alerts','7':'performance','8':'options'}
      if(tabKeys[e.key]) { setTab(tabKeys[e.key]); return }
      if(e.key==='r'||e.key==='R') { fetchMkt(); return }
      if(e.key==='d'||e.key==='D') { toggleDark(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const tabs=[{id:'signals',l:'📡 Signals'},{id:'crypto',l:'🪙 Crypto'},{id:'positions',l:'💼 Portfolio'},{id:'trades',l:'📋 History'},{id:'charts',l:'📈 Charts'},{id:'alerts',l:'🔔 Alerts'},{id:'performance',l:'🏆 Performance'},{id:'options',l:'⛓ Options'},{id:'watchlist',l:'👁 Watchlist'},{id:'reports',l:'📅 Reports'},{id:'siglog',l:'📊 Signal Log'},{id:'backtest',l:'🔬 Backtest'}]
  const isConn=!!at

  return (
    <>
      <Head>
        <title>Projectzero — Algo Trading</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <meta name="theme-color" content="#080c14"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:t.bg,fontFamily:'Inter,sans-serif',color:t.text,transition:'background 0.3s'}}>
        {dark&&<><div style={{position:'fixed',top:-150,left:-150,width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(59,158,255,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/><div style={{position:'fixed',bottom:-150,right:-150,width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(167,139,250,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/></>}

        <header style={{
            background: dark ? 'rgba(8,12,20,0.92)' : 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${t.border}`,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 60,
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: dark ? '0 1px 0 rgba(255,255,255,0.04)' : '0 1px 0 rgba(0,0,0,0.06)',
          }}>
            {/* Logo */}
            <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>router.push('/dashboard')}>
              <div style={{
                width:32,height:32,borderRadius:9,
                background:'linear-gradient(135deg,#ff6600,#ff9500)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:16,fontWeight:900,color:'#fff',
                boxShadow:'0 2px 8px #ff660040',
                flexShrink:0,
              }}>P</div>
              <div>
                <span style={{fontWeight:800,fontSize:15,color:t.text,letterSpacing:'-0.3px'}}>Projectzero</span>
                <span style={{
                  fontSize:9,fontWeight:600,color:'#ff6600',
                  background:'#ff660014',border:'1px solid #ff660033',
                  borderRadius:4,padding:'1px 5px',marginLeft:6,letterSpacing:'0.05em',
                }}>BETA</span>
              </div>
            </div>

            {/* Center — market status */}
            <div style={{display:'flex',alignItems:'center',gap:20}}>
              {mkt.NIFTY && (
                <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>setTab('signals')}>
                  <span style={{fontSize:11,color:t.muted}}>NIFTY</span>
                  <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:600,fontSize:13,color:t.text}}>₹{mkt.NIFTY?.price?.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                  <span style={{fontSize:11,fontWeight:600,color:(mkt.NIFTY?.pct||0)>=0?t.green:t.red}}>{(mkt.NIFTY?.pct||0)>=0?'+':''}{mkt.NIFTY?.pct!=null?mkt.NIFTY.pct.toFixed(2):'--'}%</span>
                </div>
              )}
              {mkt.BTC && (
                <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>setTab('crypto')}>
                  <span style={{fontSize:11,color:t.muted}}>BTC</span>
                  <span style={{fontFamily:'JetBrains Mono,monospace',fontWeight:600,fontSize:13,color:t.text}}>${mkt.BTC?.price?.toLocaleString('en-US',{maximumFractionDigits:0})}</span>
                  <span style={{fontSize:11,fontWeight:600,color:(mkt.BTC?.pct||0)>=0?t.green:t.red}}>{(mkt.BTC?.pct||0)>=0?'+':''}{mkt.BTC?.pct!=null?mkt.BTC.pct.toFixed(2):'--'}%</span>
                </div>
              )}
            </div>

            {/* Right — actions */}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {/* Kite status */}
              <div style={{
                display:'flex',alignItems:'center',gap:6,
                padding:'5px 12px',borderRadius:20,
                background: at ? t.green+'14' : t.surface,
                border:`1px solid ${at ? t.green+'44' : t.border}`,
                cursor:'pointer',
              }} onClick={()=>at ? disc() : loginUrl && window.location.assign(loginUrl)}>
                <div style={{width:7,height:7,borderRadius:'50%',background:at?t.green:t.muted,flexShrink:0,boxShadow:at?`0 0 6px ${t.green}`:''}}/>
                <span style={{fontSize:12,fontWeight:600,color:at?t.green:t.muted}}>{at ? 'Zerodha' : 'Connect'}</span>
              </div>

              {/* Morning brief */}
              <button onClick={()=>router.push('/morning')}
                style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${t.amber}44`,background:t.amber+'14',color:t.amber,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Inter,sans-serif'}}>
                ☀️
              </button>

              {/* AI */}
              <button onClick={()=>router.push('/ai')}
                style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${t.purple}44`,background:t.purple+'14',color:t.purple,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Inter,sans-serif'}}>
                🤖 AI
              </button>
              <div style={{display:'flex',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'2px 3px',gap:1}}>
                {[['off','AI Off',t.muted],['smart','Smart',t.amber],['full','Full AI',t.purple]].map(([m,l,c])=>(
                  <button key={m} onClick={()=>{setAiMode(m);localStorage.setItem('pz_ai_mode',m)}}
                    style={{padding:'3px 10px',borderRadius:16,border:'none',background:aiMode===m?c+'22':'transparent',color:aiMode===m?c:t.muted,fontWeight:aiMode===m?700:500,cursor:'pointer',fontSize:11,fontFamily:'Inter,sans-serif'}}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Dark mode toggle */}
              <button onClick={toggleDark}
                style={{width:36,height:36,borderRadius:10,border:`1px solid ${t.border}`,background:t.surface,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {dark ? '☀️' : '🌙'}
              </button>
            </div>
          </header>

        <TickerBar mkt={mkt} t={t} setTab={setTab} isConn={isConn} />

        <div style={{padding:'0 16px',display:'flex',gap:0,borderBottom:`1px solid ${t.border}`,background:dark?'rgba(8,12,20,0.92)':'rgba(255,255,255,0.95)',backdropFilter:'blur(10px)',position:'sticky',top:60,zIndex:90,overflowX:'auto',WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
          {tabs.map(tb=>(
            <button key={tb.id} onClick={()=>setTab(tb.id)} style={{
              padding:'13px 18px',
              fontSize:12,fontWeight:tab===tb.id?700:500,
              background:'transparent',
              border:'none',
              borderBottom:tab===tb.id?`2px solid #ff6600`:'2px solid transparent',
              color:tab===tb.id?'#ff6600':t.muted,
              cursor:'pointer',
              fontFamily:'Inter,sans-serif',
              transition:'all 0.2s',
              letterSpacing:'-0.1px',
              whiteSpace:'nowrap',
            }}>{tb.l}</button>
          ))}
        </div>

        <main style={{padding:'0 16px 60px',maxWidth:1440,margin:'0 auto',position:'relative',zIndex:1}}>
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:'0 16px 16px 16px',padding:28}}>
            {!isConn&&tab!=='charts'&&<div style={{background:dark?t.blue+'0d':t.blue+'0a',border:`1px solid ${t.blue}33`,borderRadius:16,padding:18,marginBottom:24,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}><div><p style={{color:t.blue,fontWeight:700,fontSize:14}}>🔐 Login with Zerodha for live data & 1-click execution</p><p style={{color:t.muted,fontSize:12,marginTop:3}}>Live prices · Real positions · Auto stop loss · SL + Target in one click</p></div><button onClick={()=>loginUrl&&window.location.assign(loginUrl)} style={{padding:'10px 22px',background:`linear-gradient(135deg,${t.green},${t.teal})`,border:'none',borderRadius:12,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Inter,sans-serif',flexShrink:0,boxShadow:`0 4px 20px ${t.green}33`}}>Connect Now →</button></div>}

            {tab==='signals'&&<div><MarketStatusBanner t={t}/><DayStrategyHint t={t}/><div style={{marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Live Signals</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>8 PZ strategies · ORB, Momentum, Supertrend, VWAP, Bollinger, MACD</p></div></div><MarketRegimeBanner t={t}/><NewsBar t={t} market='india'/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(340px,100%),1fr))',gap:20,marginTop:20}}>{PZ_STRATEGIES.map(s=><SignalCard key={s.id} strat={s} at={at} onTrade={()=>setTr(r=>r+1)} t={t} aiMode={aiMode}/>)}</div></div>}
            {tab==='crypto'&&<CryptoTab t={t} aiMode={aiMode} />}
            {tab==='alerts'&&<AlertsTab t={t}/>}
            {tab==='performance'&&<PerformanceTab t={t} setTab={setTab}/>}
            {tab==='options'&&<OptionsTab t={t}/>}
            {tab==='watchlist'&&<WatchlistTab t={t} at={at}/>}
            {tab==='reports'&&<ReportsTab t={t}/>}
            {tab==='siglog'&&<SignalLogTab t={t}/>}
            {tab==='backtest'&&<BacktestTab t={t}/>}
            {tab==='positions'&&<div>
              <div style={{marginBottom:22,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Portfolio</h2>
                  <p style={{color:t.muted,fontSize:13,marginTop:5}}>Indian markets (Zerodha) + Crypto (Binance) · Live balances</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
                <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid ${t.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <span style={{fontSize:20}}>🇮🇳</span>
                    <p style={{fontWeight:800,fontSize:16,color:t.text}}>Zerodha</p>
                    <span style={{background:at?t.green+'22':t.red+'22',color:at?t.green:t.red,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${at?t.green:t.red}33`}}>{at?'Connected':'Not connected'}</span>
                  </div>
                  <Positions at={at} t={t}/>
                </div>
                <div style={{background:t.card,borderRadius:16,padding:20,border:`1px solid ${t.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <span style={{fontSize:20}}>🪙</span>
                    <p style={{fontWeight:800,fontSize:16,color:t.text}}>Binance</p>
                    <span style={{background:t.green+'22',color:t.green,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,border:`1px solid ${t.green}33`}}>API Connected</span>
                  </div>
                  <BinancePortfolio t={t}/>
                </div>
              </div>
            </div>}
            {tab==='trades'&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}><div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Trade History</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>All trades · Entry/Exit · P&L</p></div><button onClick={()=>setTr(r=>r+1)} style={{padding:'8px 16px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontSize:12,fontFamily:'Inter,sans-serif',fontWeight:600}}>🔄 Refresh</button></div><History refresh={tr} t={t}/></div>}
            {tab==='charts'&&<Charts t={t} at={at}/>}
          </div>
        </main>
      </div>
      <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.2)} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }

  * { box-sizing: border-box; margin: 0; padding: 0 }

  body {
    font-family: 'Inter', 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::-webkit-scrollbar { width: 4px; height: 4px }
  ::-webkit-scrollbar-track { background: transparent }
  ::-webkit-scrollbar-thumb { background: #ff660044; border-radius: 99px }
  ::-webkit-scrollbar-thumb:hover { background: #ff6600aa }

  /* Cards animate in */
  .card-enter { animation: fadeIn 0.3s ease forwards }

  /* Smooth button hover */
  button { transition: all 0.15s ease !important; outline: none !important }
  button:hover:not(:disabled) { transform: translateY(-1px) }
  button:active:not(:disabled) { transform: translateY(0) }

  /* Signal strength bar animation */
  .strength-bar { transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1) }

  /* Tab active indicator */
  .tab-active { position: relative }
  .tab-active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, #ff6600, #ff9500);
    border-radius: 2px 2px 0 0;
  }

  /* Loading skeleton */
  .skeleton {
    background: linear-gradient(90deg, #1c253500 0%, #2435501a 50%, #1c253500 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  /* Price change colors */
  .up { color: #00d17a }
  .down { color: #ff4060 }

  /* Monospace numbers */
  .mono { font-family: 'JetBrains Mono', monospace }

  select { outline: none; -webkit-appearance: none }
  input { outline: none }
  input::placeholder { opacity: 0.4 }
  a { text-decoration: none }

  /* Mobile touch targets */
  @media (max-width: 768px) { button { min-height: 38px } }
  div::-webkit-scrollbar { height:3px; width:4px }
  div::-webkit-scrollbar-thumb { background:#ff660033; border-radius:3px }
`}</style>
    </>
  )
}
