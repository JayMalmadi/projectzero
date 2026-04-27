import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (n, d=2) => n != null ? Number(n).toLocaleString('en-IN', {maximumFractionDigits:d}) : '\u2014'
const clr = v => v > 0 ? '#00e676' : v < 0 ? '#ff3d57' : '#64748b'

const PZ_STRATEGIES = [
  { id:'pz-orb',      name:'PZ-ORB Filter',     emoji:'\u25ce', desc:'76% success rate. Gap+volume filter removes 39% false signals.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-tuesday',  name:'Tuesday Momentum',   emoji:'\ud83d\udcc5', desc:'Data-proven: Tue avg +0.97% BankNifty. Enter trend on Tue/Wed only.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-gap-fade', name:'Gap & Fade',         emoji:'\ud83d\udcc9', desc:'24 gap-ups + 24 gap-downs in 3 months. Fade gaps >0.35% back to prev close.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-swing',    name:'Weak Stock Swing',   emoji:'\ud83d\udcca', desc:'IT sector -24 to -31%. Short bounces to 21-EMA. 3-5 day hold.', symbols:['TCS','INFY','ICICIBANK'], type:'Swing' },
]

function Badge({ children, color='#00d4ff' }) {
  return <span style={{background:color+'22',color,border:`1px solid ${color}44`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:600}}>{children}</span>
}

function StatBox({ label, value, color='#e2e8f0' }) {
  return (
    <div style={{background:'#0a0e1a',borderRadius:10,padding:'10px 14px'}}>
      <p style={{color:'#64748b',fontSize:11,fontWeight:500,letterSpacing:'0.08em',marginBottom:4}}>{label}</p>
      <p style={{color,fontSize:15,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{value}</p>
    </div>
  )
}

function TVChart({ symbol }) {
  const tvMap = {NIFTY:'NSE:NIFTY50',BANKNIFTY:'NSE:BANKNIFTY',TCS:'NSE:TCS',INFY:'NSE:INFY',ICICIBANK:'NSE:ICICIBANK'}
  const tvSym = tvMap[symbol] || `NSE:${symbol}`
  const id = `tv_${symbol}_${Math.random().toString(36).slice(2,7)}`
  useEffect(() => {
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({autosize:true,symbol:tvSym,interval:'15',timezone:'Asia/Kolkata',theme:'dark',style:'1',locale:'en',hide_top_toolbar:false,studies:['RSI@tv-basicstudies','Volume@tv-basicstudies'],container_id:id})
    const el = document.getElementById(id)
    if (el) { el.innerHTML = ''; el.appendChild(s) }
  }, [symbol])
  return <div id={id} style={{height:380,borderRadius:12,overflow:'hidden',border:'1px solid #1e2d4a'}} />
}

function SignalCard({ strat, enctoken, onTradeExecuted }) {
  const [sym, setSym]         = useState(strat.symbols[0])
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [trading, setTrading] = useState(false)
  const [tradeMsg, setTradeMsg] = useState('')

  useEffect(() => { load() }, [sym, strat.id])

  async function load() {
    setLoading(true); setData(null)
    try { const r = await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`); setData(await r.json()) } catch {}
    setLoading(false)
  }

  async function executeTrade() {
    if (!enctoken) { setTradeMsg('\u26a0 Connect Zerodha first'); return }
    if (!data || data.signal === 'HOLD') { setTradeMsg('No active signal'); return }
    setTrading(true); setTradeMsg('')
    const qty = sym.includes('NIFTY') ? 75 : 30
    try {
      const r = await fetch('/api/kite', {method:'POST',headers:{'Content-Type':'application/json','x-kite-token':enctoken},
        body:JSON.stringify({endpoint:'/orders/regular',method:'POST',body:{tradingsymbol:sym,exchange:'NSE',transaction_type:data.signal==='BUY'?'BUY':'SELL',order_type:'MARKET',quantity:qty,product:'MIS',validity:'DAY'}})})
      const result = await r.json()
      const oid = result.data?.order_id
      if (oid) {
        await fetch('/api/trades',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:sym,direction:data.signal,quantity:qty,entry_price:data.price,stop_loss:data.stopLoss,target:data.target,strategy:strat.name,order_id:oid})})
        setTradeMsg(`\u2705 Order placed! ID: ${oid}`)
        onTradeExecuted && onTradeExecuted()
      } else { setTradeMsg(`\u274c ${result.message||'Error placing order'}`) }
    } catch(e) { setTradeMsg(`\u274c ${e.message}`) }
    setTrading(false)
  }

  const sigColor = data?.signal==='BUY'?'#00e676':data?.signal==='SELL'?'#ff3d57':'#ffab00'

  return (
    <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:16,padding:20,display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:18}}>{strat.emoji}</span>
            <span style={{fontWeight:700,fontSize:15,color:'#e2e8f0'}}>{strat.name}</span>
            <Badge color={strat.type==='Swing'?'#ffab00':'#00d4ff'}>{strat.type}</Badge>
          </div>
          <p style={{color:'#64748b',fontSize:12}}>{strat.desc}</p>
        </div>
        {data && !loading && <div style={{background:sigColor+'22',color:sigColor,border:`2px solid ${sigColor}44`,borderRadius:10,padding:'8px 16px',fontWeight:800,fontSize:15,flexShrink:0}}>{data.signal}</div>}
      </div>

      <div style={{display:'flex',gap:6}}>
        {strat.symbols.map(s => (
          <button key={s} onClick={() => setSym(s)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:600,background:sym===s?'#00d4ff22':'#0a0e1a',border:`1px solid ${sym===s?'#00d4ff':'#1e2d4a'}`,color:sym===s?'#00d4ff':'#64748b',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>{s}</button>
        ))}
      </div>

      {loading && <p style={{color:'#64748b',fontSize:13,textAlign:'center',padding:20}}>Analysing market data...</p>}

      {data && !loading && <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          <StatBox label="PRICE"      value={`\u20b9${fmt(data.price)}`} />
          <StatBox label="STOP LOSS"  value={data.stopLoss?`\u20b9${fmt(data.stopLoss)}`:'\u2014'} color='#ff3d57' />
          <StatBox label="TARGET"     value={data.target?`\u20b9${fmt(data.target)}`:'\u2014'} color='#00e676' />
          <StatBox label="CONFIDENCE" value={`${data.confidence}%`} color={data.confidence>70?'#00e676':data.confidence>50?'#ffab00':'#ff3d57'} />
        </div>

        <div style={{background:'#0a0e1a',borderRadius:8,padding:'10px 14px'}}>
          <p style={{color:'#94a3b8',fontSize:12,lineHeight:1.6}}>\ud83d\udcca {data.reason}</p>
          {data.today && <p style={{color:'#475569',fontSize:11,marginTop:4}}>Today: {data.today} \xb7 Market: BEARISH \xb7 Best day: Tuesday \xb7 ORB: {data.marketContext?.orbSuccessRate}</p>}
        </div>

        {data.chartData && <div style={{height:80}}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chartData}>
              <XAxis dataKey="date" hide /><YAxis domain={['auto','auto']} hide />
              <Tooltip contentStyle={{background:'#0a0e1a',border:'1px solid #1e2d4a',borderRadius:8,fontSize:11}} />
              <Line type="monotone" dataKey="close" stroke="#00d4ff" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="ema9"  stroke="#ffab00" dot={false} strokeWidth={1} strokeDasharray="3 2" />
              <Line type="monotone" dataKey="ema21" stroke="#ff3d57" dot={false} strokeWidth={1} strokeDasharray="3 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          <button onClick={() => setShowChart(!showChart)} style={{padding:'10px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Space Grotesk,sans-serif'}}>
            {showChart ? '\ud83d\udcc9 Hide Chart' : '\ud83d\udcc8 TradingView'}
          </button>
          <button onClick={() => window.open(`https://kite.zerodha.com/chart/web/ciq/NSE/${sym}/EQ`,'_blank')} style={{padding:'10px',background:'#1a2744',border:'1px solid #2d4a6a',borderRadius:8,color:'#00d4ff',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Space Grotesk,sans-serif'}}>
            \ud83d\udd17 Open in Kite
          </button>
          <button onClick={executeTrade} disabled={trading||data.signal==='HOLD'} style={{padding:'10px',border:'none',borderRadius:8,fontWeight:700,fontSize:12,cursor:(trading||data.signal==='HOLD')?'not-allowed':'pointer',background:data.signal==='HOLD'?'#1e2d4a':data.signal==='BUY'?'linear-gradient(135deg,#00e676,#00b248)':'linear-gradient(135deg,#ff3d57,#c62828)',color:'#fff',fontFamily:'Space Grotesk,sans-serif',opacity:(trading||data.signal==='HOLD')?0.6:1}}>
            {trading?'\u23f3 Placing...':data.signal==='HOLD'?'No Signal':`\u26a1 ${data.signal} Now`}
          </button>
        </div>

        {tradeMsg && <p style={{color:tradeMsg.startsWith('\u2705')?'#00e676':'#ff3d57',fontSize:12,textAlign:'center'}}>{tradeMsg}</p>}
        {showChart && <div style={{marginTop:8}}><TVChart symbol={sym} /></div>}
      </>}
    </div>
  )
}

function TradeHistory({ refresh }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [refresh])

  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/trades?limit=50'); const d = await r.json(); setTrades(d.trades||[]) } catch {}
    setLoading(false)
  }

  async function closeTrade(id, entryPrice) {
    const ep = prompt(`Exit price? (entry: \u20b9${entryPrice})`)
    if (!ep) return
    const r = await fetch('/api/trades',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})})
    const d = await r.json()
    alert(`Closed! P&L: \u20b9${d.pnl?.toFixed(2)}`)
    load()
  }

  const closed  = trades.filter(t=>t.status==='CLOSED')
  const openT   = trades.filter(t=>t.status==='OPEN')
  const totalPnL= closed.reduce((a,t)=>a+(t.pnl||0),0)
  const winRate = closed.length>0?(closed.filter(t=>(t.pnl||0)>0).length/closed.length*100).toFixed(0)+'%':'--'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        <StatBox label="TOTAL TRADES" value={trades.length} />
        <StatBox label="OPEN" value={openT.length} color='#ffab00' />
        <StatBox label="WIN RATE" value={winRate} color={parseInt(winRate)>50?'#00e676':'#ff3d57'} />
        <StatBox label="TOTAL P&L" value={`\u20b9${fmt(totalPnL)}`} color={clr(totalPnL)} />
      </div>

      {loading && <p style={{color:'#64748b',textAlign:'center',padding:30}}>Loading...</p>}
      {!loading && trades.length===0 && <div style={{textAlign:'center',padding:40,color:'#64748b'}}><p style={{fontSize:32,marginBottom:12}}>\ud83d\udccb</p><p>No trades yet. Execute a signal to get started!</p></div>}

      {!loading && trades.length>0 && <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr>{['Date','Symbol','Strategy','Dir','Qty','Entry','Exit','P&L','Status',''].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #1e2d4a',whiteSpace:'nowrap'}}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {trades.map((t,i) => {
              const pc = (t.pnl||0)>0?'#00e676':(t.pnl||0)<0?'#ff3d57':'#64748b'
              const date = new Date(t.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
              return <tr key={t.id} style={{background:i%2===0?'transparent':'#ffffff05',borderBottom:'1px solid #1e2d4a22'}}>
                <td style={{padding:'10px 12px',color:'#64748b',whiteSpace:'nowrap'}}>{date}</td>
                <td style={{padding:'10px 12px',fontWeight:700,color:'#e2e8f0'}}>{t.symbol}</td>
                <td style={{padding:'10px 12px',color:'#94a3b8',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.strategy}</td>
                <td style={{padding:'10px 12px'}}><span style={{color:t.direction==='BUY'?'#00e676':'#ff3d57',fontWeight:700}}>{t.direction}</span></td>
                <td style={{padding:'10px 12px',color:'#94a3b8',fontFamily:'monospace'}}>{t.quantity}</td>
                <td style={{padding:'10px 12px',color:'#e2e8f0',fontFamily:'monospace'}}>\u20b9{fmt(t.entry_price)}</td>
                <td style={{padding:'10px 12px',color:'#94a3b8',fontFamily:'monospace'}}>{t.exit_price?`\u20b9${fmt(t.exit_price)}`:'\u2014'}</td>
                <td style={{padding:'10px 12px',color:pc,fontWeight:700,fontFamily:'monospace'}}>{t.pnl!=null?`${t.pnl>=0?'+':''}\u20b9${fmt(t.pnl)}`:'\u2014'}</td>
                <td style={{padding:'10px 12px'}}><span style={{background:t.status==='OPEN'?'#ffab0022':'#00e67622',color:t.status==='OPEN'?'#ffab00':'#00e676',border:`1px solid ${t.status==='OPEN'?'#ffab0044':'#00e67644'}`,borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:600}}>{t.status}</span></td>
                <td style={{padding:'10px 12px'}}>{t.status==='OPEN'&&<button onClick={()=>closeTrade(t.id,t.entry_price)} style={{padding:'4px 10px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>Close</button>}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

export default function Dashboard() {
  const router  = useRouter()
  const [marketData, setMarketData]         = useState({})
  const [enctoken, setEnctoken]             = useState('')
  const [zerodhaConnected, setZerodha]      = useState(false)
  const [showConnect, setShowConnect]       = useState(false)
  const [activeTab, setActiveTab]           = useState('signals')
  const [time, setTime]                     = useState('')
  const [tradeRefresh, setTradeRefresh]     = useState(0)

  useEffect(() => {
    if (!localStorage.getItem('pz_token')) { router.push('/'); return }
    const enc = localStorage.getItem('kite_enctoken')
    if (enc) { setEnctoken(enc); setZerodha(true) }
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN',{hour12:false,timeZone:'Asia/Kolkata'})+' IST')
    tick(); const t = setInterval(tick,1000); return () => clearInterval(t)
  }, [])

  useEffect(() => { fetchMarket(); const t = setInterval(fetchMarket,30000); return () => clearInterval(t) }, [enctoken])

  async function fetchMarket() {
    try {
      const r = await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,BTC', {headers:enctoken?{'x-kite-token':enctoken}:{}})
      const d = await r.json(); if (d.data) setMarketData(d.data)
    } catch {}
  }

  function saveToken() {
    const enc = prompt('Paste enctoken from Kite (F12 \u2192 Network \u2192 any request \u2192 Cookie \u2192 enctoken=...):')
    if (enc?.trim()) { localStorage.setItem('kite_enctoken',enc.trim()); setEnctoken(enc.trim()); setZerodha(true); setShowConnect(false) }
  }

  const tabs = [{id:'signals',label:'\ud83d\udce1 Signals'},{id:'trades',label:'\ud83d\udccb Trade History'},{id:'market',label:'\ud83d\udcca Market'},{id:'charts',label:'\ud83d\udcc8 Charts'}]

  return (
    <>
      <Head>
        <title>Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <div style={{minHeight:'100vh',background:'#0a0e1a',fontFamily:'Space Grotesk,sans-serif',color:'#e2e8f0'}}>
        <div style={{position:'fixed',inset:0,opacity:0.025,pointerEvents:'none',backgroundImage:'linear-gradient(#00d4ff 1px,transparent 1px),linear-gradient(90deg,#00d4ff 1px,transparent 1px)',backgroundSize:'40px 40px'}} />

        <header style={{background:'#0f162888',backdropFilter:'blur(12px)',borderBottom:'1px solid #1e2d4a',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:60,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#00d4ff,#0066ff)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,color:'#fff',boxShadow:'0 0 16px rgba(0,212,255,0.3)'}}>P0</div>
            <span style={{fontWeight:700,fontSize:16}}>Projectzero</span>
            <Badge>FHP228</Badge>
            <Badge color='#ffab00'>\u20b910k-25k Mode</Badge>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{color:'#475569',fontSize:12,fontFamily:'JetBrains Mono,monospace'}}>{time}</span>
            <button onClick={() => zerodhaConnected?(localStorage.removeItem('kite_enctoken'),setEnctoken(''),setZerodha(false)):setShowConnect(true)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',background:zerodhaConnected?'#00e67622':'#ff3d5722',border:`1px solid ${zerodhaConnected?'#00e67644':'#ff3d5744'}`,borderRadius:8,cursor:'pointer',color:'#e2e8f0',fontSize:12,fontFamily:'Space Grotesk,sans-serif',fontWeight:500}}>
              <span style={{width:7,height:7,borderRadius:'50%',display:'inline-block',background:zerodhaConnected?'#00e676':'#ff3d57'}} />
              {zerodhaConnected?'Zerodha Live':'Connect Zerodha'}
            </button>
            <button onClick={() => {localStorage.removeItem('pz_token');router.push('/')}} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:12}}>Logout</button>
          </div>
        </header>

        {showConnect && (
          <div style={{position:'fixed',inset:0,background:'#00000099',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
            <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:20,padding:32,width:440,maxWidth:'90vw'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}>
                <h3 style={{fontWeight:700}}>Connect Zerodha</h3>
                <button onClick={() => setShowConnect(false)} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:18}}>\xd7</button>
              </div>
              <div style={{background:'#0a0e1a',borderRadius:10,padding:16,marginBottom:16}}>
                <p style={{color:'#ffab00',fontSize:13,fontWeight:600,marginBottom:8}}>Get enctoken in 1 min:</p>
                <ol style={{color:'#94a3b8',fontSize:12,lineHeight:2,paddingLeft:16}}>
                  <li>Open kite.zerodha.com and log in</li>
                  <li>Press F12 \u2192 Network tab \u2192 click any request</li>
                  <li>Headers \u2192 Cookie \u2192 copy after enctoken=</li>
                  <li>Click button below and paste it</li>
                </ol>
              </div>
              <button onClick={saveToken} style={{width:'100%',padding:12,background:'linear-gradient(135deg,#00d4ff,#0066ff)',border:'none',borderRadius:10,color:'#fff',fontWeight:600,cursor:'pointer',fontSize:14,fontFamily:'Space Grotesk,sans-serif'}}>
                Paste enctoken & Connect
              </button>
            </div>
          </div>
        )}

        <div style={{background:'#0a0e1a',borderBottom:'1px solid #1e2d4a',padding:'10px 24px',display:'flex',gap:32,overflowX:'auto'}}>
          {['NIFTY','BANKNIFTY','SENSEX','BTC'].map(sym => {
            const d=marketData[sym]; const up=(d?.pct||0)>=0
            return <div key={sym} style={{display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
              <span style={{color:'#64748b',fontSize:12,fontWeight:600}}>{sym}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:13,color:'#e2e8f0'}}>{d?fmt(d.price):'\u2014'}</span>
              <span style={{fontSize:12,color:up?'#00e676':'#ff3d57'}}>{d?`${up?'+':''}${fmt(d.pct,2)}%`:''}</span>
            </div>
          })}
        </div>

        <div style={{padding:'20px 24px 0',display:'flex',gap:4}}>
          {tabs.map(t=><button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:'8px 18px',borderRadius:'8px 8px 0 0',background:activeTab===t.id?'#0f1628':'transparent',border:`1px solid ${activeTab===t.id?'#1e2d4a':'transparent'}`,borderBottom:activeTab===t.id?'1px solid #0f1628':'1px solid transparent',color:activeTab===t.id?'#e2e8f0':'#64748b',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'Space Grotesk,sans-serif'}}>{t.label}</button>)}
        </div>

        <main style={{padding:'0 24px 60px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:'0 12px 12px 12px',padding:24}}>

            {activeTab==='signals' && <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:18,fontWeight:700}}>Projectzero Custom Strategies</h2>
                  <p style={{color:'#64748b',fontSize:13,marginTop:4}}>Built from 3-month NSE data \xb7 Bearish market mode \xb7 76% ORB success \xb7 Tuesday = best entry day</p>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:20}}>
                {PZ_STRATEGIES.map(s=><SignalCard key={s.id} strat={s} enctoken={enctoken} onTradeExecuted={()=>setTradeRefresh(r=>r+1)} />)}
              </div>
            </div>}

            {activeTab==='trades' && <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:18,fontWeight:700}}>Trade History & P&L</h2>
                  <p style={{color:'#64748b',fontSize:13,marginTop:4}}>All executed trades with entry, exit, P&L tracking</p>
                </div>
                <button onClick={()=>setTradeRefresh(r=>r+1)} style={{padding:'8px 16px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif'}}>\ud83d\udd04 Refresh</button>
              </div>
              <TradeHistory refresh={tradeRefresh} />
            </div>}

            {activeTab==='market' && <div>
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:8}}>Market Overview</h2>
              <p style={{color:'#64748b',fontSize:13,marginBottom:20}}>3-month insight: Market BEARISH -5% \xb7 Tuesday best \xb7 Thursday/Friday worst</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:24}}>
                {Object.entries(marketData).map(([sym,d])=>{const up=(d?.pct||0)>=0;return(
                  <div key={sym} onClick={()=>setActiveTab('charts')} style={{background:'#0a0e1a',border:`1px solid ${up?'#00e67622':'#ff3d5722'}`,borderRadius:12,padding:'14px 18px',borderTop:`2px solid ${up?'#00e676':'#ff3d57'}`,cursor:'pointer'}}>
                    <p style={{color:'#64748b',fontSize:11,fontWeight:600}}>{sym}</p>
                    <p style={{color:'#e2e8f0',fontSize:20,fontWeight:700,marginTop:2,fontFamily:'JetBrains Mono,monospace'}}>{fmt(d.price)}</p>
                    <p style={{color:up?'#00e676':'#ff3d57',fontSize:13,fontWeight:600,marginTop:2}}>{up?'+':''}{fmt(d.pct,2)}%</p>
                  </div>
                )})}
              </div>
              <div style={{background:'#0a0e1a',borderRadius:12,padding:20}}>
                <p style={{fontWeight:600,marginBottom:12}}>\ud83d\udcc5 Day of Week Performance (3-month real data)</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                  {[{day:'Mon',n:-0.43,b:-0.69},{day:'Tue',n:+0.76,b:+0.97},{day:'Wed',n:+0.54,b:+0.74},{day:'Thu',n:-0.58,b:-0.67},{day:'Fri',n:-0.55,b:-0.55}].map(d=>(
                    <div key={d.day} style={{background:'#0f1628',borderRadius:8,padding:12,textAlign:'center',border:`1px solid ${d.n>0?'#00e67633':'#ff3d5733'}`}}>
                      <p style={{fontWeight:700,fontSize:14,color:'#e2e8f0',marginBottom:6}}>{d.day}</p>
                      <p style={{fontSize:12,color:d.n>0?'#00e676':'#ff3d57'}}>N: {d.n>0?'+':''}{d.n}%</p>
                      <p style={{fontSize:12,color:d.b>0?'#00e676':'#ff3d57'}}>B: {d.b>0?'+':''}{d.b}%</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>}

            {activeTab==='charts' && <div>
              <h2 style={{fontSize:18,fontWeight:700,marginBottom:20}}>Live Charts \u2014 TradingView + Kite</h2>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
                {['NIFTY','BANKNIFTY'].map(sym=>(
                  <div key={sym}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <p style={{fontWeight:700,color:'#e2e8f0'}}>{sym}</p>
                      <button onClick={()=>window.open(`https://kite.zerodha.com/chart/web/ciq/NSE/${sym}/EQ`,'_blank')} style={{padding:'4px 12px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#00d4ff',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>\ud83d\udd17 Open in Kite</button>
                    </div>
                    <TVChart symbol={sym} />
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:20}}>
                {['TCS','INFY','ICICIBANK'].map(sym=>(
                  <div key={sym}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <p style={{fontWeight:700,color:'#e2e8f0'}}>{sym}</p>
                      <button onClick={()=>window.open(`https://kite.zerodha.com/chart/web/ciq/NSE/${sym}/EQ`,'_blank')} style={{padding:'4px 10px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#00d4ff',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>Kite \u2197</button>
                    </div>
                    <TVChart symbol={sym} />
                  </div>
                ))}
              </div>
            </div>}

          </div>
        </main>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}} *{box-sizing:border-box}`}</style>
    </>
  )
}
