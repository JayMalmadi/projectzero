import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (n,d=2) => n!=null ? Number(n).toLocaleString('en-IN',{maximumFractionDigits:d}) : '—'
const clr = (v,t) => v>0?t.green:v<0?t.red:t.muted

const KITE_CHARTS = {
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

const PZ_STRATEGIES = [
  {id:'pz-orb',      name:'PZ-ORB Filter',    emoji:'◎', desc:'76% success. Gap+volume filter removes false signals.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-tuesday',  name:'Tuesday Momentum', emoji:'📅', desc:'Data: Tue avg +0.97% BankNifty. Enter on Tue/Wed.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-gap-fade', name:'Gap & Fade',        emoji:'〰', desc:'24 gap-ups in 3 months. Fade gaps >0.35%.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-swing',    name:'Weak Stock Swing',  emoji:'📊', desc:'IT sector -24 to -31%. Short bounces to EMA.', symbols:['TCS','INFY','ICICIBANK'], type:'Swing'},
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
  const [candles, setCandles] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [source,  setSource]  = React.useState('')
  const [intv,    setIntv]    = React.useState('15minute')
  const [last,    setLast]    = React.useState(null)
  const [live,    setLive]    = React.useState(true)
  const [updated, setUpdated] = React.useState(null)
  const chartRef = React.useRef(null)
  const tvRef    = React.useRef(null)
  const serRef   = React.useRef(null)
  const volRef   = React.useRef(null)
  const timerRef = React.useRef(null)
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

  React.useEffect(()=>{
    loadData()
    if (timerRef.current) clearInterval(timerRef.current)
    if (live) timerRef.current=setInterval(()=>loadData(true), cfg.refresh*1000)
    return ()=>{ if (timerRef.current) clearInterval(timerRef.current) }
  },[symbol,intv,accessToken,live])

  React.useEffect(()=>{
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
          {KITE_CHARTS[symbol]&&<button onClick={()=>window.open(KITE_CHARTS[symbol],'_blank')} style={{padding:'3px 10px',borderRadius:6,fontSize:11,background:'none',border:`1px solid ${t.border}`,color:t.blue,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Kite ↗</button>}
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
function SignalCard({strat,at,onTrade,t}) {
  const [sym,setSym]=useState(strat.symbols[0]),[data,setData]=useState(null),[loading,setLoading]=useState(false),[modal,setModal]=useState(false),[chart,setChart]=useState(false)
  useEffect(()=>{load()},[sym,strat.id])
  async function load(){setLoading(true);setData(null);try{const r=await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`);setData(await r.json())}catch{}setLoading(false)}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[{l:'PRICE',v:`₹${fmt(data.price)}`,c:t.text},{l:'STOP LOSS',v:data.stopLoss?`₹${fmt(data.stopLoss)}`:'—',c:t.red},{l:'TARGET',v:data.target?`₹${fmt(data.target)}`:'—',c:t.green},{l:'CONFIDENCE',v:`${data.confidence}%`,c:data.confidence>70?t.green:data.confidence>50?t.amber:t.red}].map(x=>(
              <div key={x.l} style={{background:t.surface,borderRadius:10,padding:'10px 12px',border:`1px solid ${t.border}`}}>
                <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:'0.07em',marginBottom:4}}>{x.l}</p>
                <p style={{color:x.c,fontSize:13,fontWeight:800,fontFamily:'monospace'}}>{x.v}</p>
              </div>
            ))}
          </div>

          <div style={{background:t.surface,borderRadius:10,padding:'10px 14px',border:`1px solid ${t.border}`}}>
            <p style={{color:t.text2,fontSize:12,lineHeight:1.7}}>{data.reason}</p>
          </div>

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
        :<div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Symbol','Qty','Avg','LTP','P&L','Chart'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{pos.map((p,i)=>{const pl=p.pnl||p.unrealised||0;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{p.tradingsymbol}</td><td style={{padding:'12px 16px',color:(p.quantity||0)>0?t.green:t.red,fontWeight:700}}>{(p.quantity||0)>0?'+':''}{p.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>₹{fmt(p.average_price)}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(p.last_price)}</td><td style={{padding:'12px 16px',color:clr(pl,t),fontWeight:800,fontFamily:'monospace'}}>{pl>=0?'+':''}₹{fmt(pl)}</td><td style={{padding:'12px 16px'}}><button onClick={()=>window.open(KITE_CHARTS[p.tradingsymbol]||`https://kite.zerodha.com/chart/web/ciq/NSE/${p.tradingsymbol}/EQ`,'_blank')} style={{padding:'4px 10px',background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:6,color:t.blue,cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>↗</button></td></tr>})}</tbody></table></div>}
      </div>
      {orders.length>0&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><p style={{color:t.muted,fontSize:11,fontWeight:700,letterSpacing:'0.1em'}}>TODAY'S ORDERS ({orders.length})</p><button onClick={load} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:11,padding:'4px 10px',fontFamily:'Space Grotesk,sans-serif'}}>🔄</button></div><div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${t.border}`}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:t.surface}}>{['Time','Symbol','Type','Qty','Price','Status'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',color:t.muted,fontWeight:700,borderBottom:`1px solid ${t.border}`}}>{h}</th>)}</tr></thead><tbody>{orders.map((o,i)=>{const time=o.order_timestamp?new Date(o.order_timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}):'—';const sc2=o.status==='COMPLETE'?t.green:o.status==='REJECTED'?t.red:o.status==='OPEN'?t.amber:t.muted;return <tr key={i} style={{borderBottom:`1px solid ${t.border}22`}}><td style={{padding:'12px 16px',color:t.muted}}>{time}</td><td style={{padding:'12px 16px',fontWeight:800,color:t.text}}>{o.tradingsymbol}</td><td style={{padding:'12px 16px'}}><span style={{color:o.transaction_type==='BUY'?t.green:t.red,fontWeight:700}}>{o.transaction_type}</span></td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text2}}>{o.filled_quantity}/{o.quantity}</td><td style={{padding:'12px 16px',fontFamily:'monospace',color:t.text}}>₹{fmt(o.average_price||o.price)}</td><td style={{padding:'12px 16px'}}><Badge color={sc2}>{o.status}</Badge></td></tr>})}</tbody></table></div></div>}
    </div>
  )
}

function Charts({t, at}) {
  const [sel,setSel]=useState('NIFTY')
  const syms=Object.keys(KITE_CHARTS)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Live Charts</h2><p style={{color:t.muted,fontSize:13,marginTop:4}}>Kite charts embedded · Full indicators · Your account</p></div>
        <button onClick={()=>window.open(KITE_CHARTS[sel],'_blank')} style={{padding:'8px 18px',background:t.accent,border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif'}}>Full Screen ↗</button>
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
  async function close(id,entry,dir){const ep=prompt(`Exit price? (Entry: ₹${entry})`);if(!ep||isNaN(ep))return;const r=await fetch('/api/trades',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})});const d=await r.json();alert(`P&L: ₹${d.pnl?.toFixed(2)} ${d.pnl>0?'🟢':'🔴'}`);load()}
  const closed=trades.filter(x=>x.status==='CLOSED'),openT=trades.filter(x=>x.status==='OPEN'),totalPnL=closed.reduce((a,x)=>a+(x.pnl||0),0),wr=closed.length>0?`${(closed.filter(x=>(x.pnl||0)>0).length/closed.length*100).toFixed(0)}%`:'—'
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
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


function TickerBar({mkt, t, setTab, isConn}) {
  const syms = ['NIFTY','BANKNIFTY','SENSEX','BTC']
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
  }

  function disc(){['kite_access_token','kite_user','kite_connected_date'].forEach(k=>localStorage.removeItem(k));setAt('');setKU(null)}

  const tabs=[{id:'signals',l:'📡 Signals'},{id:'positions',l:'💼 Portfolio'},{id:'trades',l:'📋 History'},{id:'charts',l:'📈 Charts'}]
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

            {tab==='signals'&&<div><div style={{marginBottom:22}}><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Live Signals</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>4 custom PZ strategies built from 3-month NSE data · 76% ORB · Tue/Wed best days</p></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(370px,1fr))',gap:20}}>{PZ_STRATEGIES.map(s=><SignalCard key={s.id} strat={s} at={at} onTrade={()=>setTr(r=>r+1)} t={t}/>)}</div></div>}
            {tab==='positions'&&<div><div style={{marginBottom:22}}><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Portfolio</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>Live from Zerodha · Positions · Margins · Today's orders</p></div><Positions at={at} t={t}/></div>}
            {tab==='trades'&&<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22}}><div><h2 style={{fontSize:22,fontWeight:900,color:t.text}}>Trade History</h2><p style={{color:t.muted,fontSize:13,marginTop:5}}>All trades · Entry/Exit · P&L</p></div><button onClick={()=>setTr(r=>r+1)} style={{padding:'8px 16px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>🔄 Refresh</button></div><History refresh={tr} t={t}/></div>}
            {tab==='charts'&&<Charts t={t} at={at}/>}
          </div>
        </main>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#374151;border-radius:2px}`}</style>
    </>
  )
}
