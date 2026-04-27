import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'

// ── Helpers ────────────────────────────────────────────────────
const fmt  = (n, d=2) => n != null ? Number(n).toLocaleString('en-IN',{maximumFractionDigits:d}) : '—'
const clr  = v => v > 0 ? '#00e676' : v < 0 ? '#ff3d57' : '#64748b'
const isr  = () => typeof window !== 'undefined'

const PZ_STRATEGIES = [
  {id:'pz-orb',      name:'PZ-ORB Filter',    emoji:'◎', desc:'76% success. Gap+volume filter removes false signals.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-tuesday',  name:'Tuesday Momentum', emoji:'📅', desc:'Data: Tue avg +0.97% BankNifty. Enter trend Tue/Wed.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-gap-fade', name:'Gap & Fade',        emoji:'📉', desc:'24 gap-ups + 24 gap-downs in 3 months. Fade >0.35%.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday'},
  {id:'pz-swing',    name:'Weak Stock Swing',  emoji:'📊', desc:'IT sector -24 to -31%. Short bounces to 21-EMA.', symbols:['TCS','INFY','ICICIBANK'], type:'Swing'},
]

const KITE_CHART_URL = {
  NIFTY:    'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%2050/INDICES',
  BANKNIFTY:'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%20BANK/INDICES',
  TCS:      'https://kite.zerodha.com/chart/web/ciq/NSE/TCS/EQ',
  INFY:     'https://kite.zerodha.com/chart/web/ciq/NSE/INFY/EQ',
  ICICIBANK:'https://kite.zerodha.com/chart/web/ciq/NSE/ICICIBANK/EQ',
  RELIANCE: 'https://kite.zerodha.com/chart/web/ciq/NSE/RELIANCE/EQ',
  HDFCBANK: 'https://kite.zerodha.com/chart/web/ciq/NSE/HDFCBANK/EQ',
  SBIN:     'https://kite.zerodha.com/chart/web/ciq/NSE/SBIN/EQ',
}

// ── Sub-components ─────────────────────────────────────────────
function Badge({children, color='#00d4ff'}) {
  return <span style={{background:color+'22',color,border:`1px solid ${color}44`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:600}}>{children}</span>
}
function StatBox({label, value, color='#e2e8f0', sub}) {
  return (
    <div style={{background:'#0a0e1a',borderRadius:10,padding:'10px 14px'}}>
      <p style={{color:'#64748b',fontSize:11,fontWeight:500,letterSpacing:'0.07em',marginBottom:4}}>{label}</p>
      <p style={{color,fontSize:15,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{value}</p>
      {sub && <p style={{color:'#475569',fontSize:11,marginTop:2}}>{sub}</p>}
    </div>
  )
}

// ── Execute Modal ──────────────────────────────────────────────
function ExecuteModal({data, strat, sym, accessToken, onClose, onDone}) {
  const [qty,       setQty]     = useState(1)
  const [product,   setProduct] = useState('MIS')
  const [placing,   setPlacing] = useState(false)
  const [result,    setResult]  = useState(null)
  const [placeSL,   setPlaceSL] = useState(true)
  const [placeTgt,  setPlaceTgt]= useState(true)

  const risk   = data.stopLoss ? Math.abs(data.price - data.stopLoss) * qty : null
  const reward = data.target   ? Math.abs(data.target - data.price)   * qty : null
  const sc     = data.signal === 'BUY' ? '#00e676' : '#ff3d57'

  async function place() {
    if (!accessToken) { setResult({ok:false, msg:'Not connected to Zerodha. Click "Login with Zerodha" first.'}); return }
    setPlacing(true)
    try {
      const body = {
        tradingsymbol: sym,
        exchange: sym === 'NIFTY' || sym === 'BANKNIFTY' ? 'NFO' : 'NSE',
        transaction_type: data.signal,
        quantity: qty,
        product,
        order_type: 'MARKET',
        stop_loss_price: placeSL  && data.stopLoss ? data.stopLoss : null,
        target_price:    placeTgt && data.target   ? data.target   : null,
      }
      const r = await fetch('/api/kite-pro?action=place_order', {
        method: 'POST',
        headers: {'Content-Type':'application/json','x-kite-access-token': accessToken},
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.status === 'success') {
        // Save to Supabase
        await fetch('/api/trades', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            symbol: sym, direction: data.signal, quantity: qty,
            entry_price: data.price, stop_loss: data.stopLoss,
            target: data.target, strategy: strat.name,
            order_id: d.results?.main_order_id,
            notes: `SL Order: ${d.results?.sl_order_id || 'none'} | Target Order: ${d.results?.target_order_id || 'none'}`,
          })
        })
        setResult({ok:true, msg: d.message, details: d.results})
        onDone && onDone()
      } else {
        setResult({ok:false, msg: d.error || d.message || 'Order failed'})
      }
    } catch(e) { setResult({ok:false, msg: e.message}) }
    setPlacing(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'#000000dd',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:16}}>
      <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:20,padding:28,width:480,maxWidth:'100%',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{background:sc+'22',border:`2px solid ${sc}`,borderRadius:10,padding:'6px 16px',color:sc,fontWeight:800,fontSize:18}}>{data.signal}</div>
            <div><p style={{fontWeight:700,fontSize:16,color:'#e2e8f0'}}>{sym}</p><p style={{color:'#64748b',fontSize:12}}>{strat.name}</p></div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:24}}>×</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
          <StatBox label="ENTRY" value={`₹${fmt(data.price)}`} />
          <StatBox label="STOP LOSS" value={data.stopLoss?`₹${fmt(data.stopLoss)}`:'—'} color='#ff3d57' sub={risk?`Risk: ₹${fmt(risk)}`:null} />
          <StatBox label="TARGET" value={data.target?`₹${fmt(data.target)}`:'—'} color='#00e676' sub={reward?`Gain: ₹${fmt(reward)}`:null} />
        </div>

        {risk && reward && (
          <div style={{background:'#0a0e1a',borderRadius:8,padding:'8px 14px',marginBottom:12,display:'flex',justifyContent:'space-between'}}>
            <span style={{color:'#64748b',fontSize:12}}>Risk : Reward</span>
            <span style={{color:'#00d4ff',fontWeight:700,fontSize:13}}>1 : {(reward/risk).toFixed(1)}</span>
            <span style={{color:'#64748b',fontSize:12}}>Confidence</span>
            <span style={{color: data.confidence>70?'#00e676':data.confidence>50?'#ffab00':'#ff3d57',fontWeight:700,fontSize:13}}>{data.confidence}%</span>
          </div>
        )}

        <div style={{background:'#0a0e1a',borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div>
              <p style={{color:'#64748b',fontSize:11,fontWeight:500,marginBottom:8}}>QUANTITY</p>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:32,height:32,background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                <span style={{color:'#e2e8f0',fontWeight:700,fontSize:18,minWidth:32,textAlign:'center'}}>{qty}</span>
                <button onClick={()=>setQty(q=>q+1)} style={{width:32,height:32,background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
              </div>
            </div>
            <div>
              <p style={{color:'#64748b',fontSize:11,fontWeight:500,marginBottom:8}}>PRODUCT TYPE</p>
              <select value={product} onChange={e=>setProduct(e.target.value)} style={{background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',fontSize:13,padding:'7px 10px',fontFamily:'Space Grotesk,sans-serif',width:'100%'}}>
                <option value="MIS">MIS — Intraday (auto sq-off)</option>
                <option value="CNC">CNC — Delivery (stocks)</option>
                <option value="NRML">NRML — F&O overnight</option>
              </select>
            </div>
          </div>

          <div style={{display:'flex',gap:16}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={placeSL} onChange={e=>setPlaceSL(e.target.checked)} style={{width:16,height:16,accentColor:'#ff3d57'}} />
              <span style={{color:'#ff3d57',fontSize:12,fontWeight:600}}>Auto Stop Loss @ ₹{fmt(data.stopLoss)}</span>
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={placeTgt} onChange={e=>setPlaceTgt(e.target.checked)} style={{width:16,height:16,accentColor:'#00e676'}} />
              <span style={{color:'#00e676',fontSize:12,fontWeight:600}}>Auto Target @ ₹{fmt(data.target)}</span>
            </label>
          </div>
        </div>

        <div style={{background:'#060d1a',border:'1px solid #1e3d5a',borderRadius:10,padding:12,marginBottom:16}}>
          <p style={{color:'#00d4ff',fontSize:12,fontWeight:600,marginBottom:6}}>⚡ What happens when you click Place Order:</p>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {[
              `1. Main ${data.signal} order sent to NSE via Zerodha`,
              placeSL  ? `2. Stop Loss order auto-placed at ₹${fmt(data.stopLoss)} (SL-M)` : '2. Stop Loss: skipped',
              placeTgt ? `3. Target order auto-placed at ₹${fmt(data.target)} (LIMIT)` : '3. Target: skipped',
              '4. All order IDs saved to Trade History',
            ].map((s,i) => <p key={i} style={{color:'#64748b',fontSize:11}}>{s}</p>)}
          </div>
        </div>

        {result ? (
          <div style={{textAlign:'center',padding:16}}>
            <p style={{fontSize:36,marginBottom:8}}>{result.ok?'✅':'❌'}</p>
            <p style={{color:result.ok?'#00e676':'#ff3d57',fontWeight:700,fontSize:15,marginBottom:8}}>{result.msg}</p>
            {result.details && (
              <div style={{background:'#0a0e1a',borderRadius:8,padding:10,textAlign:'left'}}>
                {result.details.main_order_id  && <p style={{color:'#64748b',fontSize:11}}>Main Order ID: <span style={{color:'#e2e8f0',fontFamily:'monospace'}}>{result.details.main_order_id}</span></p>}
                {result.details.sl_order_id    && <p style={{color:'#64748b',fontSize:11}}>SL Order ID: <span style={{color:'#ff3d57',fontFamily:'monospace'}}>{result.details.sl_order_id}</span></p>}
                {result.details.target_order_id && <p style={{color:'#64748b',fontSize:11}}>Target Order ID: <span style={{color:'#00e676',fontFamily:'monospace'}}>{result.details.target_order_id}</span></p>}
              </div>
            )}
            <button onClick={onClose} style={{marginTop:12,padding:'8px 24px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <button onClick={place} disabled={placing||!accessToken} style={{
            width:'100%',padding:16,border:'none',borderRadius:12,
            background: !accessToken ? '#1e2d4a' : placing ? '#1e3d4a' : data.signal==='BUY'
              ? 'linear-gradient(135deg,#00e676,#00b248)'
              : 'linear-gradient(135deg,#ff3d57,#c62828)',
            color: !accessToken ? '#475569' : '#fff',
            fontWeight:700,fontSize:15,cursor:placing||!accessToken?'not-allowed':'pointer',
            fontFamily:'Space Grotesk,sans-serif',
            boxShadow: accessToken && !placing ? `0 0 30px ${data.signal==='BUY'?'rgba(0,230,118,0.25)':'rgba(255,61,87,0.25)'}` : 'none',
          }}>
            {!accessToken ? '⚠ Login with Zerodha first' : placing ? '⏳ Placing orders on NSE...' : `⚡ Place ${data.signal} + SL + Target`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Signal Card ────────────────────────────────────────────────
function SignalCard({strat, accessToken, onTradeExecuted}) {
  const [sym,       setSym]       = useState(strat.symbols[0])
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { loadSignal() }, [sym, strat.id])

  async function loadSignal() {
    setLoading(true); setData(null)
    try { const r = await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`); setData(await r.json()) }
    catch {}
    setLoading(false)
  }

  const sc = data?.signal==='BUY'?'#00e676':data?.signal==='SELL'?'#ff3d57':'#ffab00'

  return (
    <>
      {showModal && data && <ExecuteModal data={data} strat={strat} sym={sym} accessToken={accessToken} onClose={()=>setShowModal(false)} onDone={()=>{setShowModal(false);onTradeExecuted&&onTradeExecuted()}} />}
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
          {data && !loading && <div style={{background:sc+'22',color:sc,border:`2px solid ${sc}44`,borderRadius:10,padding:'6px 14px',fontWeight:800,fontSize:14,flexShrink:0}}>{data.signal}</div>}
        </div>

        <div style={{display:'flex',gap:6}}>
          {strat.symbols.map(s=>(
            <button key={s} onClick={()=>setSym(s)} style={{padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:600,background:sym===s?'#00d4ff22':'#0a0e1a',border:`1px solid ${sym===s?'#00d4ff':'#1e2d4a'}`,color:sym===s?'#00d4ff':'#64748b',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>{s}</button>
          ))}
        </div>

        {loading && <p style={{color:'#64748b',fontSize:13,textAlign:'center',padding:16}}>Analysing live data...</p>}

        {data && !loading && <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            <StatBox label="PRICE"      value={`₹${fmt(data.price)}`} />
            <StatBox label="STOP LOSS"  value={data.stopLoss?`₹${fmt(data.stopLoss)}`:'—'} color='#ff3d57' />
            <StatBox label="TARGET"     value={data.target?`₹${fmt(data.target)}`:'—'} color='#00e676' />
            <StatBox label="CONFIDENCE" value={`${data.confidence}%`} color={data.confidence>70?'#00e676':data.confidence>50?'#ffab00':'#ff3d57'} />
          </div>
          <div style={{background:'#0a0e1a',borderRadius:8,padding:'10px 14px'}}>
            <p style={{color:'#94a3b8',fontSize:12,lineHeight:1.7}}>{data.reason}</p>
          </div>
          {data.chartData && <div style={{height:70}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chartData}>
                <defs>
                  <linearGradient id={`g${strat.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={sc} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={sc} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide /><YAxis domain={['auto','auto']} hide />
                <Tooltip contentStyle={{background:'#0a0e1a',border:'1px solid #1e2d4a',borderRadius:8,fontSize:11}} />
                <Area type="monotone" dataKey="close" stroke={sc} fill={`url(#g${strat.id})`} dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button onClick={()=>window.open(KITE_CHART_URL[sym],'_blank')} style={{padding:'10px',background:'#0a0e1a',border:'1px solid #1e2d4a',borderRadius:8,color:'#00d4ff',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Space Grotesk,sans-serif'}}>
              📈 Open Chart in Kite ↗
            </button>
            <button onClick={()=>setShowModal(true)} disabled={data.signal==='HOLD'} style={{padding:'10px',border:'none',borderRadius:8,fontWeight:700,fontSize:12,cursor:data.signal==='HOLD'?'not-allowed':'pointer',background:data.signal==='HOLD'?'#1e2d4a':data.signal==='BUY'?'linear-gradient(135deg,#00e676,#00b248)':'linear-gradient(135deg,#ff3d57,#c62828)',color:data.signal==='HOLD'?'#475569':'#fff',fontFamily:'Space Grotesk,sans-serif',opacity:data.signal==='HOLD'?0.5:1}}>
              {data.signal==='HOLD'?'No Signal — Hold':`⚡ ${data.signal} — Review & Execute`}
            </button>
          </div>
        </>}
      </div>
    </>
  )
}

// ── Positions Panel ────────────────────────────────────────────
function PositionsPanel({accessToken}) {
  const [positions, setPositions] = useState([])
  const [funds,     setFunds]     = useState(null)
  const [orders,    setOrders]    = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { if (accessToken) { loadAll() } }, [accessToken])

  async function loadAll() {
    setLoading(true)
    try {
      const [pr, fr, or] = await Promise.all([
        fetch('/api/kite-pro?action=positions',{headers:{'x-kite-access-token':accessToken}}).then(r=>r.json()),
        fetch('/api/kite-pro?action=funds',    {headers:{'x-kite-access-token':accessToken}}).then(r=>r.json()),
        fetch('/api/kite-pro?action=orders',   {headers:{'x-kite-access-token':accessToken}}).then(r=>r.json()),
      ])
      setPositions([...(pr.data?.net||[]), ...(pr.data?.day||[])].filter(p=>p.quantity!==0))
      setFunds(fr.data)
      setOrders((or.data||[]).slice(0,10))
    } catch {}
    setLoading(false)
  }

  if (!accessToken) return (
    <div style={{textAlign:'center',padding:60,color:'#64748b'}}>
      <p style={{fontSize:40,marginBottom:12}}>🔐</p>
      <p style={{fontWeight:600,marginBottom:4}}>Login with Zerodha to see your positions</p>
      <p style={{fontSize:13}}>Click "Login with Zerodha" button in the header</p>
    </div>
  )

  if (loading) return <p style={{color:'#64748b',textAlign:'center',padding:40}}>Loading from Zerodha...</p>

  const equity   = funds?.equity
  const avail    = equity?.available?.live_balance || equity?.net || 0
  const used     = equity?.utilised?.debits || 0
  const totalPnL = positions.reduce((a,p)=>a+(p.pnl||p.unrealised||0),0)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* Funds */}
      {funds && (
        <div>
          <h3 style={{fontWeight:600,fontSize:14,marginBottom:12,color:'#94a3b8'}}>ACCOUNT FUNDS</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            <StatBox label="AVAILABLE MARGIN" value={`₹${fmt(avail)}`} color='#00d4ff' />
            <StatBox label="USED MARGIN"       value={`₹${fmt(used)}`}  color='#ffab00' />
            <StatBox label="UNREALISED P&L"    value={`${totalPnL>=0?'+':''}₹${fmt(totalPnL)}`} color={clr(totalPnL)} />
          </div>
        </div>
      )}

      {/* Open Positions */}
      <div>
        <h3 style={{fontWeight:600,fontSize:14,marginBottom:12,color:'#94a3b8'}}>OPEN POSITIONS ({positions.length})</h3>
        {positions.length === 0 ? (
          <div style={{background:'#0a0e1a',borderRadius:10,padding:20,textAlign:'center',color:'#475569',fontSize:13}}>No open positions</div>
        ) : (
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #1e2d4a'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'#0a0e1a'}}>
                  {['Symbol','Product','Qty','Avg Price','LTP','P&L','Action'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #1e2d4a'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p,i)=>{
                  const pnl    = p.pnl || p.unrealised || 0
                  const pc     = clr(pnl)
                  const isLong = (p.quantity||0) > 0
                  return (
                    <tr key={i} style={{borderBottom:'1px solid #1e2d4a22'}}>
                      <td style={{padding:'10px 14px',fontWeight:700,color:'#e2e8f0'}}>{p.tradingsymbol}</td>
                      <td style={{padding:'10px 14px'}}><Badge color='#64748b'>{p.product}</Badge></td>
                      <td style={{padding:'10px 14px'}}><span style={{color:isLong?'#00e676':'#ff3d57',fontWeight:700}}>{isLong?'+':''}{p.quantity}</span></td>
                      <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#94a3b8'}}>₹{fmt(p.average_price)}</td>
                      <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#e2e8f0'}}>₹{fmt(p.last_price)}</td>
                      <td style={{padding:'10px 14px',color:pc,fontWeight:700,fontFamily:'monospace'}}>{pnl>=0?'+':''}₹{fmt(pnl)}</td>
                      <td style={{padding:'10px 14px'}}>
                        <button onClick={()=>window.open(KITE_CHART_URL[p.tradingsymbol]||`https://kite.zerodha.com`,'_blank')} style={{padding:'3px 10px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#00d4ff',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>Chart ↗</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Today's Orders */}
      {orders.length > 0 && (
        <div>
          <h3 style={{fontWeight:600,fontSize:14,marginBottom:12,color:'#94a3b8'}}>TODAY'S ORDERS</h3>
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #1e2d4a'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'#0a0e1a'}}>
                  {['Time','Symbol','Type','Qty','Price','Status'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #1e2d4a'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o,i)=>{
                  const time = o.order_timestamp ? new Date(o.order_timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '—'
                  const stColor = o.status==='COMPLETE'?'#00e676':o.status==='REJECTED'?'#ff3d57':o.status==='OPEN'?'#ffab00':'#64748b'
                  return (
                    <tr key={i} style={{borderBottom:'1px solid #1e2d4a22'}}>
                      <td style={{padding:'10px 14px',color:'#64748b'}}>{time}</td>
                      <td style={{padding:'10px 14px',fontWeight:700,color:'#e2e8f0'}}>{o.tradingsymbol}</td>
                      <td style={{padding:'10px 14px'}}><span style={{color:o.transaction_type==='BUY'?'#00e676':'#ff3d57',fontWeight:700}}>{o.transaction_type}</span></td>
                      <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#94a3b8'}}>{o.filled_quantity}/{o.quantity}</td>
                      <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#e2e8f0'}}>₹{fmt(o.average_price||o.price)}</td>
                      <td style={{padding:'10px 14px'}}><Badge color={stColor}>{o.status}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={loadAll} style={{marginTop:8,padding:'6px 14px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif'}}>🔄 Refresh</button>
        </div>
      )}
    </div>
  )
}

// ── Trade History ──────────────────────────────────────────────
function TradeHistory({refresh}) {
  const [trades,  setTrades]  = useState([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { load() }, [refresh])
  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/trades?limit=50'); const d=await r.json(); setTrades(d.trades||[]) } catch{}
    setLoading(false)
  }
  async function closeTrade(id, entry, dir, qty) {
    const ep = prompt(`Exit price? (Entry: ₹${entry}, ${dir})`)
    if (!ep||isNaN(ep)) return
    const r = await fetch('/api/trades',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})})
    const d = await r.json()
    alert(`Closed! P&L: ₹${d.pnl?.toFixed(2)} ${d.pnl>0?'🟢 Profit':'🔴 Loss'}`)
    load()
  }
  const closed=trades.filter(t=>t.status==='CLOSED'), openT=trades.filter(t=>t.status==='OPEN')
  const totalPnL=closed.reduce((a,t)=>a+(t.pnl||0),0)
  const winRate=closed.length>0?`${(closed.filter(t=>(t.pnl||0)>0).length/closed.length*100).toFixed(0)}%`:'—'
  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        <StatBox label="TOTAL TRADES" value={trades.length} />
        <StatBox label="OPEN"         value={openT.length}  color='#ffab00' />
        <StatBox label="WIN RATE"     value={winRate}        color={parseInt(winRate)>50?'#00e676':'#ff3d57'} />
        <StatBox label="TOTAL P&L"    value={`₹${fmt(totalPnL)}`} color={clr(totalPnL)} />
      </div>
      {loading && <p style={{color:'#64748b',textAlign:'center',padding:30}}>Loading...</p>}
      {!loading && trades.length===0 && (
        <div style={{textAlign:'center',padding:40,color:'#64748b',background:'#0a0e1a',borderRadius:12}}>
          <p style={{fontSize:36,marginBottom:10}}>📋</p>
          <p style={{fontWeight:600}}>No trades yet</p>
          <p style={{fontSize:13,marginTop:4}}>Execute a signal to get started</p>
        </div>
      )}
      {!loading && trades.length>0 && (
        <div style={{overflowX:'auto',borderRadius:10,border:'1px solid #1e2d4a'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'#0a0e1a'}}>
              {['Date','Symbol','Strategy','Dir','Qty','Entry','Exit','P&L','Status',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #1e2d4a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{trades.map((t,i)=>{
              const pc=clr(t.pnl||0)
              const date=new Date(t.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})
              return <tr key={t.id} style={{borderBottom:'1px solid #1e2d4a22',background:i%2?'#ffffff03':'transparent'}}>
                <td style={{padding:'10px 14px',color:'#64748b',whiteSpace:'nowrap'}}>{date}</td>
                <td style={{padding:'10px 14px',fontWeight:700,color:'#e2e8f0'}}>{t.symbol}</td>
                <td style={{padding:'10px 14px',color:'#64748b',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.strategy}</td>
                <td style={{padding:'10px 14px'}}><span style={{background:t.direction==='BUY'?'#00e67222':'#ff3d5722',color:t.direction==='BUY'?'#00e676':'#ff3d57',border:`1px solid ${t.direction==='BUY'?'#00e67244':'#ff3d5744'}`,borderRadius:6,padding:'2px 8px',fontWeight:700,fontSize:11}}>{t.direction}</span></td>
                <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#94a3b8'}}>{t.quantity}</td>
                <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#e2e8f0'}}>₹{fmt(t.entry_price)}</td>
                <td style={{padding:'10px 14px',fontFamily:'monospace',color:'#94a3b8'}}>{t.exit_price?`₹${fmt(t.exit_price)}`:'—'}</td>
                <td style={{padding:'10px 14px',color:pc,fontWeight:700,fontFamily:'monospace'}}>{t.pnl!=null?`${t.pnl>=0?'+':''}₹${fmt(t.pnl)}`:'—'}</td>
                <td style={{padding:'10px 14px'}}><Badge color={t.status==='OPEN'?'#ffab00':t.status==='CLOSED'?'#00e676':'#ff3d57'}>{t.status}</Badge></td>
                <td style={{padding:'10px 14px'}}>{t.status==='OPEN'&&<button onClick={()=>closeTrade(t.id,t.entry_price,t.direction,t.quantity)} style={{padding:'4px 10px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>Close</button>}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Charts Tab ─────────────────────────────────────────────────
function ChartsTab() {
  const [sel, setSel] = useState('NIFTY')
  const syms = Object.keys(KITE_CHART_URL)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700}}>Live Charts</h2>
          <p style={{color:'#64748b',fontSize:13,marginTop:4}}>Full Kite charts with all indicators. Opens in Kite — your session, your data.</p>
        </div>
        <button onClick={()=>window.open(KITE_CHART_URL[sel],'_blank')} style={{padding:'8px 18px',background:'linear-gradient(135deg,#00d4ff,#0066ff)',border:'none',borderRadius:8,color:'#fff',fontWeight:600,cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif'}}>
          🔗 Open {sel} in Kite ↗
        </button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
        {syms.map(s=>(
          <button key={s} onClick={()=>setSel(s)} style={{padding:'7px 16px',borderRadius:20,fontSize:13,fontWeight:600,background:sel===s?'linear-gradient(135deg,#00d4ff,#0066ff)':'#0a0e1a',border:`1px solid ${sel===s?'#00d4ff':'#1e2d4a'}`,color:sel===s?'#fff':'#64748b',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>{s}</button>
        ))}
      </div>
      <div style={{background:'#0a0e1a',borderRadius:16,padding:24,textAlign:'center',border:'1px solid #1e2d4a'}}>
        <p style={{fontSize:40,marginBottom:12}}>📈</p>
        <p style={{fontWeight:700,fontSize:16,color:'#e2e8f0',marginBottom:8}}>Open {sel} Chart in Kite</p>
        <p style={{color:'#64748b',fontSize:13,marginBottom:20,maxWidth:400,margin:'0 auto 20px'}}>
          Kite has full professional charts with all indicators, drawing tools, and your complete order history. Click below to open.
        </p>
        <button onClick={()=>window.open(KITE_CHART_URL[sel],'_blank')} style={{padding:'14px 32px',background:'linear-gradient(135deg,#00d4ff,#0066ff)',border:'none',borderRadius:12,color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',boxShadow:'0 0 30px rgba(0,212,255,0.3)'}}>
          Open {sel} Chart in Kite ↗
        </button>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8,marginTop:24}}>
          {syms.filter(s=>s!==sel).map(s=>(
            <button key={s} onClick={()=>window.open(KITE_CHART_URL[s],'_blank')} style={{padding:'10px',background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:10,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',display:'flex',flexDirection:'column',gap:3,alignItems:'flex-start'}}>
              <span style={{color:'#475569',fontSize:10,fontWeight:600}}>KITE CHART</span>
              <span style={{color:'#e2e8f0',fontSize:13,fontWeight:700}}>{s} ↗</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const [accessToken,   setAccessToken]   = useState('')
  const [kiteUser,      setKiteUser]      = useState(null)
  const [marketData,    setMarketData]    = useState({})
  const [activeTab,     setActiveTab]     = useState('signals')
  const [time,          setTime]          = useState('')
  const [tradeRefresh,  setTradeRefresh]  = useState(0)
  const [loginUrl,      setLoginUrl]      = useState('')

  useEffect(() => {
    if (!localStorage.getItem('pz_token')) { router.push('/'); return }

    // Restore Kite session
    const at   = localStorage.getItem('kite_access_token')
    const user = localStorage.getItem('kite_user')
    const date = localStorage.getItem('kite_connected_date')

    // Check if session is from today
    if (at && date === new Date().toDateString()) {
      setAccessToken(at)
      if (user) setKiteUser(JSON.parse(user))
    } else {
      // Clear stale session
      localStorage.removeItem('kite_access_token')
      localStorage.removeItem('kite_user')
      localStorage.removeItem('kite_connected_date')
    }

    // Get login URL
    fetch('/api/kite-login').then(r=>r.json()).then(d => setLoginUrl(d.loginUrl))

    // Clock
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN',{hour12:true,timeZone:'Asia/Kolkata'})+' IST')
    tick(); const t = setInterval(tick,1000); return ()=>clearInterval(t)
  }, [])

  useEffect(() => {
    fetchMarket()
    const t = setInterval(fetchMarket, 15000)
    return () => clearInterval(t)
  }, [accessToken])

  async function fetchMarket() {
    try {
      // Use Kite live quotes if connected
      if (accessToken) {
        const r = await fetch('/api/kite-pro?action=quote&instruments=NSE:NIFTY+50,NSE:NIFTY+BANK,BSE:SENSEX,NSE:TCS', {
          headers: {'x-kite-access-token': accessToken}
        })
        const d = await r.json()
        if (d.data) {
          const mapped = {}
          const keyMap = {'NIFTY 50':'NIFTY','NIFTY BANK':'BANKNIFTY','SENSEX':'SENSEX','TCS':'TCS'}
          Object.entries(d.data).forEach(([key, val]) => {
            const sym = keyMap[key.split(':')[1]] || key.split(':')[1]
            mapped[sym] = {
              price:  val.last_price,
              change: val.net_change,
              pct:    val.change,
              high:   val.ohlc?.high,
              low:    val.ohlc?.low,
            }
          })
          setMarketData(mapped)
          return
        }
      }
      // Fallback: Yahoo Finance
      const r = await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,BTC')
      const d = await r.json()
      if (d.data) setMarketData(d.data)
    } catch {}
  }

  function disconnectKite() {
    localStorage.removeItem('kite_access_token')
    localStorage.removeItem('kite_user')
    localStorage.removeItem('kite_connected_date')
    setAccessToken(''); setKiteUser(null)
  }

  const tabs = [
    {id:'signals',   label:'📡 Signals'},
    {id:'positions', label:'💼 Portfolio'},
    {id:'trades',    label:'📋 History'},
    {id:'charts',    label:'📈 Charts'},
  ]

  const isConnected = !!accessToken

  return (
    <>
      <Head>
        <title>Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{minHeight:'100vh',background:'#0a0e1a',fontFamily:'Space Grotesk,sans-serif',color:'#e2e8f0'}}>
        <div style={{position:'fixed',inset:0,opacity:0.025,pointerEvents:'none',backgroundImage:'linear-gradient(#00d4ff 1px,transparent 1px),linear-gradient(90deg,#00d4ff 1px,transparent 1px)',backgroundSize:'40px 40px'}} />

        {/* Header */}
        <header style={{background:'#0f162888',backdropFilter:'blur(12px)',borderBottom:'1px solid #1e2d4a',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:64,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:34,height:34,borderRadius:10,background:'linear-gradient(135deg,#00d4ff,#0066ff)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:13,color:'#fff',boxShadow:'0 0 20px rgba(0,212,255,0.4)'}}>P0</div>
            <span style={{fontWeight:700,fontSize:17}}>Projectzero</span>
            <Badge>FHP228</Badge>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{color:'#334155',fontSize:11,fontFamily:'JetBrains Mono,monospace'}}>{time}</span>

            {isConnected ? (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#00e67222',border:'1px solid #00e67244',borderRadius:8,padding:'6px 12px'}}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:'#00e676',animation:'pulse 1.5s infinite',display:'inline-block'}} />
                  <span style={{color:'#00e676',fontSize:12,fontWeight:600}}>Zerodha Live</span>
                  {kiteUser && <span style={{color:'#4caf7044',fontSize:11}}>· {kiteUser.user_id}</span>}
                </div>
                <button onClick={disconnectKite} style={{background:'none',border:'1px solid #1e2d4a',borderRadius:8,color:'#64748b',cursor:'pointer',fontSize:11,padding:'6px 10px',fontFamily:'Space Grotesk,sans-serif'}}>Disconnect</button>
              </div>
            ) : (
              <button onClick={()=>loginUrl&&window.location.assign(loginUrl)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'linear-gradient(135deg,#ff3d57,#c62828)',border:'none',borderRadius:8,cursor:'pointer',color:'#fff',fontSize:13,fontFamily:'Space Grotesk,sans-serif',fontWeight:600,boxShadow:'0 0 20px rgba(255,61,87,0.3)'}}>
                🔐 Login with Zerodha
              </button>
            )}
            <button onClick={()=>{localStorage.removeItem('pz_token');router.push('/')}} style={{background:'none',border:'none',color:'#334155',cursor:'pointer',fontSize:12}}>Logout</button>
          </div>
        </header>

        {/* Market ticker — live from Kite if connected */}
        <div style={{background:'#060c1a',borderBottom:'1px solid #1e2d4a',padding:'8px 24px',display:'flex',gap:24,overflowX:'auto',alignItems:'center'}}>
          {['NIFTY','BANKNIFTY','SENSEX','BTC'].map(sym=>{
            const d=marketData[sym]; const up=(d?.pct||0)>=0
            return (
              <div key={sym} style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,cursor:'pointer'}} onClick={()=>setActiveTab('charts')}>
                <span style={{color:'#334155',fontSize:11,fontWeight:700}}>{sym}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#e2e8f0',fontWeight:600}}>{d?fmt(d.price):'—'}</span>
                <span style={{fontSize:11,color:up?'#00e676':'#ff3d57',fontWeight:600}}>{d?`${up?'+':''}${fmt(d.pct,2)}%`:''}</span>
              </div>
            )
          })}
          <span style={{marginLeft:'auto',fontSize:10,color:'#1e2d4a',flexShrink:0}}>{isConnected?'🟢 Live from Kite':'⚪ Yahoo Finance (15-min delay)'}</span>
        </div>

        {/* Tabs */}
        <div style={{padding:'16px 24px 0',display:'flex',gap:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:'8px 18px',borderRadius:'8px 8px 0 0',background:activeTab===t.id?'#0f1628':'transparent',border:`1px solid ${activeTab===t.id?'#1e2d4a':'transparent'}`,borderBottom:activeTab===t.id?'1px solid #0f1628':'none',color:activeTab===t.id?'#e2e8f0':'#334155',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'Space Grotesk,sans-serif'}}>{t.label}</button>
          ))}
        </div>

        <main style={{padding:'0 24px 60px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:'0 12px 12px 12px',padding:24}}>

            {!isConnected && activeTab !== 'charts' && (
              <div style={{background:'#0d1a0d',border:'1px solid #1e3d1e',borderRadius:12,padding:16,marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                <div>
                  <p style={{color:'#4caf50',fontWeight:600,fontSize:13}}>🔐 Connect Zerodha for live data & one-click execution</p>
                  <p style={{color:'#2d6a2d',fontSize:12,marginTop:3}}>Live prices · Real positions · Auto stop loss · One-click orders</p>
                </div>
                <button onClick={()=>loginUrl&&window.location.assign(loginUrl)} style={{padding:'10px 20px',background:'linear-gradient(135deg,#00e676,#00b248)',border:'none',borderRadius:10,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif',flexShrink:0}}>
                  Login with Zerodha →
                </button>
              </div>
            )}

            {activeTab==='signals' && (
              <div>
                <div style={{marginBottom:20}}>
                  <h2 style={{fontSize:18,fontWeight:700}}>Live Signals — Projectzero Strategies</h2>
                  <p style={{color:'#64748b',fontSize:13,marginTop:4}}>Built from 3-month NSE analysis · 76% ORB rate · Tuesday best day · Bearish market mode</p>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:20}}>
                  {PZ_STRATEGIES.map(s=><SignalCard key={s.id} strat={s} accessToken={accessToken} onTradeExecuted={()=>setTradeRefresh(r=>r+1)} />)}
                </div>
              </div>
            )}

            {activeTab==='positions' && <PositionsPanel accessToken={accessToken} />}
            {activeTab==='trades'    && (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                  <div><h2 style={{fontSize:18,fontWeight:700}}>Trade History & P&L</h2><p style={{color:'#64748b',fontSize:13,marginTop:4}}>All executed trades · Entry/Exit · P&L tracking</p></div>
                  <button onClick={()=>setTradeRefresh(r=>r+1)} style={{padding:'7px 14px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif'}}>🔄 Refresh</button>
                </div>
                <TradeHistory refresh={tradeRefresh} />
              </div>
            )}
            {activeTab==='charts' && <ChartsTab />}

          </div>
        </main>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}} *{box-sizing:border-box}`}</style>
    </>
  )
}
