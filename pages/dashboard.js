import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (n, d=2) => n != null ? Number(n).toLocaleString('en-IN', {maximumFractionDigits:d}) : '—'
const clr = v => v > 0 ? '#00e676' : v < 0 ? '#ff3d57' : '#64748b'

const PZ_STRATEGIES = [
  { id:'pz-orb',      name:'PZ-ORB Filter',    emoji:'◎', desc:'76% ORB success. Gap+volume filter removes false signals.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-tuesday',  name:'Tuesday Momentum', emoji:'📅', desc:'Data-proven: Tue avg +0.97% BankNifty. Enter trend Tue/Wed.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-gap-fade', name:'Gap & Fade',        emoji:'📉', desc:'24 gap-ups + 24 gap-downs in 3 months. Fade gaps >0.35%.', symbols:['NIFTY','BANKNIFTY'], type:'Intraday' },
  { id:'pz-swing',    name:'Weak Stock Swing',  emoji:'📊', desc:'IT sector -24 to -31%. Short bounces to 21-EMA. 3-5 day.', symbols:['TCS','INFY','ICICIBANK'], type:'Swing' },
]

// Kite chart URLs — always work, no login popup
const KITE_CHART = {
  NIFTY:    'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%2050/INDICES',
  BANKNIFTY:'https://kite.zerodha.com/chart/web/ciq/INDICES/NIFTY%20BANK/INDICES',
  TCS:      'https://kite.zerodha.com/chart/web/ciq/NSE/TCS/EQ',
  INFY:     'https://kite.zerodha.com/chart/web/ciq/NSE/INFY/EQ',
  ICICIBANK:'https://kite.zerodha.com/chart/web/ciq/NSE/ICICIBANK/EQ',
  RELIANCE: 'https://kite.zerodha.com/chart/web/ciq/NSE/RELIANCE/EQ',
  HDFCBANK: 'https://kite.zerodha.com/chart/web/ciq/NSE/HDFCBANK/EQ',
  SENSEX:   'https://kite.zerodha.com/chart/web/ciq/INDICES/SENSEX/INDICES',
}

// TradingView widget — mini chart (free, works without login)
function TVMiniChart({ symbol }) {
  const tvMap = {
    NIFTY:'NSE:NIFTY50', BANKNIFTY:'NSE:BANKNIFTY', SENSEX:'BSE:SENSEX',
    TCS:'NSE:TCS', INFY:'NSE:INFY', ICICIBANK:'NSE:ICICIBANK',
    RELIANCE:'NSE:RELIANCE', HDFCBANK:'NSE:HDFCBANK',
  }
  const tvSym = tvMap[symbol] || `NSE:${symbol}`
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tv_${symbol}&symbol=${encodeURIComponent(tvSym)}&interval=15&hidesidetoolbar=1&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=0f1628&theme=dark&style=1&timezone=Asia%2FKolkata&studies=RSI%40tv-basicstudies%2CVolume%40tv-basicstudies&locale=en`

  return (
    <div style={{position:'relative', height:400, borderRadius:12, overflow:'hidden', border:'1px solid #1e2d4a', background:'#0f1628'}}>
      <iframe
        src={src}
        style={{width:'100%', height:'100%', border:'none'}}
        allowTransparency="true"
        allowFullScreen
        title={`Chart ${symbol}`}
      />
    </div>
  )
}

function Badge({ children, color='#00d4ff' }) {
  return <span style={{background:color+'22',color,border:`1px solid ${color}44`,borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:600}}>{children}</span>
}

function StatBox({ label, value, color='#e2e8f0', sub }) {
  return (
    <div style={{background:'#0a0e1a',borderRadius:10,padding:'10px 14px'}}>
      <p style={{color:'#64748b',fontSize:11,fontWeight:500,letterSpacing:'0.08em',marginBottom:4}}>{label}</p>
      <p style={{color,fontSize:15,fontWeight:700,fontFamily:'JetBrains Mono,monospace'}}>{value}</p>
      {sub && <p style={{color:'#475569',fontSize:11,marginTop:2}}>{sub}</p>}
    </div>
  )
}

// ── Trade Execution Modal ─────────────────────────────────────
function ExecuteModal({ data, strat, sym, enctoken, onClose, onDone }) {
  const [qty, setQty]         = useState(sym.includes('NIFTY') ? 75 : 30)
  const [orderType, setOType] = useState('MARKET')
  const [product, setProduct] = useState('MIS')
  const [placing, setPlacing] = useState(false)
  const [result, setResult]   = useState(null)

  const risk   = data.stopLoss ? Math.abs(data.price - data.stopLoss) * qty : null
  const reward = data.target   ? Math.abs(data.target - data.price)   * qty : null
  const sigColor = data.signal === 'BUY' ? '#00e676' : '#ff3d57'

  async function place() {
    if (!enctoken) { setResult({ ok:false, msg:'Connect Zerodha first (click Connect Zerodha in header)' }); return }
    setPlacing(true)
    try {
      const r = await fetch('/api/kite', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-kite-token': enctoken },
        body: JSON.stringify({
          endpoint: '/orders/regular', method: 'POST',
          body: {
            tradingsymbol: sym,
            exchange: 'NSE',
            transaction_type: data.signal,
            order_type: orderType,
            quantity: qty,
            product,
            validity: 'DAY',
          }
        })
      })
      const d = await r.json()
      const oid = d.data?.order_id
      if (oid) {
        // Save to Supabase
        await fetch('/api/trades', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            symbol: sym, direction: data.signal, quantity: qty,
            entry_price: data.price, stop_loss: data.stopLoss,
            target: data.target, strategy: strat.name, order_id: oid,
          })
        })
        setResult({ ok:true, msg:`Order placed! ID: ${oid}` })
        onDone && onDone()
      } else {
        setResult({ ok:false, msg: d.message || d.error || JSON.stringify(d) })
      }
    } catch(e) { setResult({ ok:false, msg: e.message }) }
    setPlacing(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:20,padding:28,width:460,maxWidth:'92vw'}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{background:sigColor+'22',border:`2px solid ${sigColor}`,borderRadius:8,padding:'4px 14px',color:sigColor,fontWeight:800,fontSize:16}}>
                {data.signal}
              </div>
              <span style={{fontWeight:700,fontSize:16,color:'#e2e8f0'}}>{sym}</span>
            </div>
            <p style={{color:'#64748b',fontSize:12,marginTop:4}}>{strat.name}</p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:22,lineHeight:1}}>×</button>
        </div>

        {/* Trade summary */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
          <StatBox label="ENTRY PRICE" value={`₹${fmt(data.price)}`} />
          <StatBox label="STOP LOSS"   value={data.stopLoss ? `₹${fmt(data.stopLoss)}` : '—'} color='#ff3d57'
            sub={risk ? `Risk: ₹${fmt(risk)}` : null} />
          <StatBox label="TARGET"      value={data.target ? `₹${fmt(data.target)}` : '—'} color='#00e676'
            sub={reward ? `Reward: ₹${fmt(reward)}` : null} />
        </div>

        {/* Quantity + settings */}
        <div style={{background:'#0a0e1a',borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div>
              <p style={{color:'#64748b',fontSize:11,fontWeight:500,marginBottom:6}}>QUANTITY (LOTS)</p>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button onClick={() => setQty(q => Math.max(1,q-1))} style={{width:28,height:28,background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',cursor:'pointer',fontSize:16}}>−</button>
                <span style={{color:'#e2e8f0',fontWeight:700,fontSize:16,minWidth:24,textAlign:'center'}}>{qty}</span>
                <button onClick={() => setQty(q => q+1)} style={{width:28,height:28,background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',cursor:'pointer',fontSize:16}}>+</button>
              </div>
            </div>
            <div>
              <p style={{color:'#64748b',fontSize:11,fontWeight:500,marginBottom:6}}>ORDER TYPE</p>
              <select value={orderType} onChange={e=>setOType(e.target.value)} style={{background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',fontSize:12,padding:'6px 8px',fontFamily:'Space Grotesk,sans-serif',width:'100%'}}>
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
              </select>
            </div>
            <div>
              <p style={{color:'#64748b',fontSize:11,fontWeight:500,marginBottom:6}}>PRODUCT</p>
              <select value={product} onChange={e=>setProduct(e.target.value)} style={{background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',fontSize:12,padding:'6px 8px',fontFamily:'Space Grotesk,sans-serif',width:'100%'}}>
                <option value="MIS">MIS (Intraday)</option>
                <option value="CNC">CNC (Delivery)</option>
                <option value="NRML">NRML (F&O)</option>
              </select>
            </div>
          </div>
          {risk && reward && (
            <div style={{display:'flex',justifyContent:'space-between',marginTop:12,paddingTop:12,borderTop:'1px solid #1e2d4a'}}>
              <span style={{color:'#64748b',fontSize:12}}>Total capital at risk:</span>
              <span style={{color:'#ff3d57',fontWeight:700,fontSize:12,fontFamily:'monospace'}}>₹{fmt(risk)}</span>
              <span style={{color:'#64748b',fontSize:12}}>Potential gain:</span>
              <span style={{color:'#00e676',fontWeight:700,fontSize:12,fontFamily:'monospace'}}>₹{fmt(reward)}</span>
            </div>
          )}
        </div>

        {/* How execution works info box */}
        <div style={{background:'#0d1f0d',border:'1px solid #1e3d1e',borderRadius:10,padding:12,marginBottom:16}}>
          <p style={{color:'#4caf50',fontSize:12,fontWeight:600,marginBottom:6}}>⚡ How one-click execution works:</p>
          <p style={{color:'#81c784',fontSize:11,lineHeight:1.7}}>
            1. Clicks "Place Order" button below<br/>
            2. Sends order to Zerodha via your session<br/>
            3. Zerodha places it on NSE exchange<br/>
            4. Order ID saved to your trade history<br/>
            5. Track P&amp;L in Trade History tab
          </p>
          {!enctoken && <p style={{color:'#ff3d57',fontSize:11,marginTop:8,fontWeight:600}}>⚠ Not connected to Zerodha — connect first from the header button</p>}
        </div>

        {result ? (
          <div style={{textAlign:'center',padding:16}}>
            <p style={{fontSize:32,marginBottom:8}}>{result.ok ? '✅' : '❌'}</p>
            <p style={{color:result.ok?'#00e676':'#ff3d57',fontWeight:600,fontSize:14}}>{result.msg}</p>
            <button onClick={onClose} style={{marginTop:12,padding:'8px 24px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontSize:13}}>Close</button>
          </div>
        ) : (
          <button onClick={place} disabled={placing} style={{
            width:'100%', padding:14, border:'none', borderRadius:12,
            background: placing ? '#1e2d4a' : data.signal==='BUY'
              ? 'linear-gradient(135deg,#00e676,#00b248)'
              : 'linear-gradient(135deg,#ff3d57,#c62828)',
            color:'#fff', fontWeight:700, fontSize:15,
            cursor: placing ? 'not-allowed' : 'pointer',
            fontFamily:'Space Grotesk,sans-serif',
            boxShadow: placing ? 'none' : `0 0 24px ${data.signal==='BUY'?'rgba(0,230,118,0.3)':'rgba(255,61,87,0.3)'}`,
          }}>
            {placing ? '⏳ Placing order on NSE...' : `⚡ Place ${data.signal} Order — ₹${fmt(data.price)} × ${qty}`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Signal Card ────────────────────────────────────────────────
function SignalCard({ strat, enctoken, onTradeExecuted }) {
  const [sym, setSym]           = useState(strat.symbols[0])
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [showChart, setShowChart] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { loadSignal() }, [sym, strat.id])

  async function loadSignal() {
    setLoading(true); setData(null)
    try {
      const r = await fetch(`/api/pz-strategies?symbol=${sym}&strategy=${strat.id}`)
      setData(await r.json())
    } catch {}
    setLoading(false)
  }

  const sigColor = data?.signal==='BUY' ? '#00e676' : data?.signal==='SELL' ? '#ff3d57' : '#ffab00'

  return (
    <>
      {showModal && data && (
        <ExecuteModal
          data={data} strat={strat} sym={sym}
          enctoken={enctoken}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); onTradeExecuted&&onTradeExecuted() }}
        />
      )}

      <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:16,padding:20,display:'flex',flexDirection:'column',gap:12}}>
        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontSize:18}}>{strat.emoji}</span>
              <span style={{fontWeight:700,fontSize:15,color:'#e2e8f0'}}>{strat.name}</span>
              <Badge color={strat.type==='Swing'?'#ffab00':'#00d4ff'}>{strat.type}</Badge>
            </div>
            <p style={{color:'#64748b',fontSize:12}}>{strat.desc}</p>
          </div>
          {data && !loading && (
            <div style={{background:sigColor+'22',color:sigColor,border:`2px solid ${sigColor}44`,borderRadius:10,padding:'6px 14px',fontWeight:800,fontSize:14,flexShrink:0}}>
              {data.signal}
            </div>
          )}
        </div>

        {/* Symbol selector */}
        <div style={{display:'flex',gap:6}}>
          {strat.symbols.map(s => (
            <button key={s} onClick={() => setSym(s)} style={{
              padding:'4px 12px',borderRadius:6,fontSize:12,fontWeight:600,
              background:sym===s?'#00d4ff22':'#0a0e1a',
              border:`1px solid ${sym===s?'#00d4ff':'#1e2d4a'}`,
              color:sym===s?'#00d4ff':'#64748b',cursor:'pointer',
              fontFamily:'Space Grotesk,sans-serif'
            }}>{s}</button>
          ))}
        </div>

        {loading && <p style={{color:'#64748b',fontSize:13,textAlign:'center',padding:16}}>Analysing live data...</p>}

        {data && !loading && <>
          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            <StatBox label="PRICE"       value={`₹${fmt(data.price)}`} />
            <StatBox label="STOP LOSS"   value={data.stopLoss?`₹${fmt(data.stopLoss)}`:'—'} color='#ff3d57' />
            <StatBox label="TARGET"      value={data.target?`₹${fmt(data.target)}`:'—'} color='#00e676' />
            <StatBox label="CONFIDENCE"  value={`${data.confidence}%`} color={data.confidence>70?'#00e676':data.confidence>50?'#ffab00':'#ff3d57'} />
          </div>

          {/* Reason */}
          <div style={{background:'#0a0e1a',borderRadius:8,padding:'10px 14px'}}>
            <p style={{color:'#94a3b8',fontSize:12,lineHeight:1.7}}>{data.reason}</p>
            <p style={{color:'#334155',fontSize:11,marginTop:4}}>Today: {data.today} · Market: BEARISH · Best day: Tuesday · ORB rate: {data.marketContext?.orbSuccessRate}</p>
          </div>

          {/* Mini chart */}
          {data.chartData && (
            <div style={{height:70}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chartData}>
                  <XAxis dataKey="date" hide /><YAxis domain={['auto','auto']} hide />
                  <Tooltip contentStyle={{background:'#0a0e1a',border:'1px solid #1e2d4a',borderRadius:8,fontSize:11}} />
                  <Line type="monotone" dataKey="close" stroke="#00d4ff" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="ema9"  stroke="#ffab00" dot={false} strokeWidth={1} strokeDasharray="3 2" />
                  <Line type="monotone" dataKey="ema21" stroke="#ff3d57" dot={false} strokeWidth={1} strokeDasharray="3 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Action buttons */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button onClick={() => setShowChart(!showChart)} style={{
              padding:'10px',background:'#0a0e1a',border:'1px solid #1e2d4a',
              borderRadius:8,color:'#00d4ff',cursor:'pointer',fontSize:12,fontWeight:600,
              fontFamily:'Space Grotesk,sans-serif'
            }}>
              {showChart ? '✕ Close Chart' : '📈 View Live Chart'}
            </button>
            <button onClick={() => setShowModal(true)} disabled={data.signal==='HOLD'} style={{
              padding:'10px',border:'none',borderRadius:8,fontWeight:700,fontSize:12,
              cursor: data.signal==='HOLD' ? 'not-allowed' : 'pointer',
              background: data.signal==='HOLD' ? '#1e2d4a'
                : data.signal==='BUY' ? 'linear-gradient(135deg,#00e676,#00b248)'
                : 'linear-gradient(135deg,#ff3d57,#c62828)',
              color: data.signal==='HOLD' ? '#475569' : '#fff',
              fontFamily:'Space Grotesk,sans-serif',
              opacity: data.signal==='HOLD' ? 0.5 : 1,
            }}>
              {data.signal==='HOLD' ? 'No Signal — Hold' : `⚡ ${data.signal} — Execute Trade`}
            </button>
          </div>

          {/* Live chart — Kite embed (seamless, no login popup) */}
          {showChart && (
            <div style={{borderRadius:12,overflow:'hidden',border:'1px solid #1e2d4a'}}>
              <div style={{background:'#0a0e1a',padding:'8px 12px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:'#64748b',fontSize:11}}>Live Chart — {sym} · 15 min · Kite</span>
                <button onClick={() => window.open(KITE_CHART[sym],'_blank')} style={{background:'none',border:'none',color:'#00d4ff',fontSize:11,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif'}}>
                  ↗ Open full screen
                </button>
              </div>
              <TVMiniChart symbol={sym} />
            </div>
          )}
        </>}
      </div>
    </>
  )
}

// ── Trade History ──────────────────────────────────────────────
function TradeHistory({ refresh }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [refresh])

  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/trades?limit=50'); const d = await r.json(); setTrades(d.trades||[]) } catch {}
    setLoading(false)
  }

  async function closeTrade(id, entryPrice, direction, qty) {
    const ep = prompt(`Exit price? (Entry: ₹${entryPrice}, Direction: ${direction})`)
    if (!ep || isNaN(ep)) return
    const r = await fetch('/api/trades', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,exit_price:parseFloat(ep)})})
    const d = await r.json()
    const pnl = d.pnl
    alert(`Trade closed!\nP&L: ₹${pnl?.toFixed(2)}\n${pnl > 0 ? '🟢 Profit' : '🔴 Loss'}`)
    load()
  }

  const closed   = trades.filter(t=>t.status==='CLOSED')
  const openT    = trades.filter(t=>t.status==='OPEN')
  const totalPnL = closed.reduce((a,t)=>a+(t.pnl||0),0)
  const wins     = closed.filter(t=>(t.pnl||0)>0).length
  const winRate  = closed.length > 0 ? `${(wins/closed.length*100).toFixed(0)}%` : '—'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        <StatBox label="TOTAL TRADES" value={trades.length} />
        <StatBox label="OPEN NOW"     value={openT.length} color='#ffab00' />
        <StatBox label="WIN RATE"     value={winRate} color={parseInt(winRate)>50?'#00e676':'#ff3d57'} />
        <StatBox label="TOTAL P&L"    value={`₹${fmt(totalPnL)}`} color={clr(totalPnL)} />
      </div>

      {loading && <p style={{color:'#64748b',textAlign:'center',padding:30}}>Loading...</p>}

      {!loading && trades.length === 0 && (
        <div style={{textAlign:'center',padding:40,color:'#64748b',background:'#0a0e1a',borderRadius:12}}>
          <p style={{fontSize:40,marginBottom:12}}>📋</p>
          <p style={{fontWeight:600,marginBottom:4}}>No trades yet</p>
          <p style={{fontSize:13}}>Go to Signals tab → click Execute Trade → confirm order</p>
        </div>
      )}

      {!loading && trades.length > 0 && (
        <div style={{overflowX:'auto',borderRadius:12,border:'1px solid #1e2d4a'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#0a0e1a'}}>
                {['Date & Time','Symbol','Strategy','Direction','Qty','Entry ₹','Exit ₹','P&L','Status',''].map(h=>(
                  <th key={h} style={{padding:'12px 14px',textAlign:'left',color:'#64748b',fontWeight:600,borderBottom:'1px solid #1e2d4a',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t,i) => {
                const pnlColor = (t.pnl||0)>0?'#00e676':(t.pnl||0)<0?'#ff3d57':'#64748b'
                const date = new Date(t.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true})
                return (
                  <tr key={t.id} style={{borderBottom:'1px solid #1e2d4a22',background:i%2===0?'transparent':'#ffffff03'}}>
                    <td style={{padding:'12px 14px',color:'#64748b',whiteSpace:'nowrap'}}>{date}</td>
                    <td style={{padding:'12px 14px',fontWeight:700,color:'#e2e8f0'}}>{t.symbol}</td>
                    <td style={{padding:'12px 14px',color:'#64748b',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.strategy}</td>
                    <td style={{padding:'12px 14px'}}>
                      <span style={{background:t.direction==='BUY'?'#00e67622':'#ff3d5722',color:t.direction==='BUY'?'#00e676':'#ff3d57',border:`1px solid ${t.direction==='BUY'?'#00e67644':'#ff3d5744'}`,borderRadius:6,padding:'2px 8px',fontWeight:700,fontSize:11}}>{t.direction}</span>
                    </td>
                    <td style={{padding:'12px 14px',color:'#94a3b8',fontFamily:'monospace'}}>{t.quantity}</td>
                    <td style={{padding:'12px 14px',color:'#e2e8f0',fontFamily:'monospace'}}>₹{fmt(t.entry_price)}</td>
                    <td style={{padding:'12px 14px',color:'#94a3b8',fontFamily:'monospace'}}>{t.exit_price?`₹${fmt(t.exit_price)}`:'—'}</td>
                    <td style={{padding:'12px 14px',color:pnlColor,fontWeight:700,fontFamily:'monospace'}}>
                      {t.pnl!=null?`${t.pnl>=0?'+':''}₹${fmt(t.pnl)}`:'—'}
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      <span style={{background:t.status==='OPEN'?'#ffab0022':'t.status==="CLOSED"?"#00e67622":"#ff3d5722"',color:t.status==='OPEN'?'#ffab00':t.status==='CLOSED'?'#00e676':'#ff3d57',borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:600}}>{t.status}</span>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      {t.status==='OPEN' && (
                        <button onClick={()=>closeTrade(t.id,t.entry_price,t.direction,t.quantity)} style={{padding:'4px 12px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:6,color:'#e2e8f0',cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
                          Close Trade
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Charts Tab ─────────────────────────────────────────────────
function ChartsTab() {
  const [selected, setSelected] = useState('NIFTY')
  const symbols = ['NIFTY','BANKNIFTY','TCS','INFY','ICICIBANK','RELIANCE','HDFCBANK']

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700}}>Live Charts</h2>
          <p style={{color:'#64748b',fontSize:13,marginTop:4}}>15-min live charts · Click symbol to switch · Open in Kite for full screen</p>
        </div>
        <button onClick={()=>window.open(KITE_CHART[selected],'_blank')} style={{
          padding:'8px 18px',background:'linear-gradient(135deg,#00d4ff,#0066ff)',
          border:'none',borderRadius:8,color:'#fff',fontWeight:600,cursor:'pointer',
          fontSize:13,fontFamily:'Space Grotesk,sans-serif'
        }}>
          🔗 Open {selected} in Kite ↗
        </button>
      </div>

      {/* Symbol pills */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {symbols.map(s => (
          <button key={s} onClick={()=>setSelected(s)} style={{
            padding:'6px 16px',borderRadius:20,fontSize:13,fontWeight:600,
            background: selected===s ? 'linear-gradient(135deg,#00d4ff,#0066ff)' : '#0a0e1a',
            border: `1px solid ${selected===s?'#00d4ff':'#1e2d4a'}`,
            color: selected===s ? '#fff' : '#64748b',
            cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',
            transition:'all 0.15s',
          }}>{s}</button>
        ))}
      </div>

      {/* Main chart */}
      <TVMiniChart symbol={selected} key={selected} />

      {/* Kite chart grid buttons */}
      <div style={{marginTop:16}}>
        <p style={{color:'#64748b',fontSize:12,marginBottom:10}}>Open any symbol directly in Kite:</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8}}>
          {symbols.map(s => (
            <button key={s} onClick={()=>window.open(KITE_CHART[s],'_blank')} style={{
              padding:'10px 12px',background:'#0a0e1a',border:'1px solid #1e2d4a',
              borderRadius:10,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',
              display:'flex',flexDirection:'column',gap:2,
            }}>
              <span style={{color:'#64748b',fontSize:10,fontWeight:600}}>KITE CHART</span>
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
  const [marketData,       setMarketData]       = useState({})
  const [enctoken,         setEnctoken]         = useState('')
  const [zerodhaConnected, setZerodha]          = useState(false)
  const [showConnect,      setShowConnect]      = useState(false)
  const [activeTab,        setActiveTab]        = useState('signals')
  const [time,             setTime]             = useState('')
  const [tradeRefresh,     setTradeRefresh]     = useState(0)

  useEffect(() => {
    if (!localStorage.getItem('pz_token')) { router.push('/'); return }
    const enc = localStorage.getItem('kite_enctoken')
    if (enc) { setEnctoken(enc); setZerodha(true) }
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN',{hour12:true,timeZone:'Asia/Kolkata'})+' IST')
    tick(); const t = setInterval(tick,1000); return ()=>clearInterval(t)
  }, [])

  useEffect(() => {
    fetchMarket()
    const t = setInterval(fetchMarket, 30000)
    return () => clearInterval(t)
  }, [enctoken])

  async function fetchMarket() {
    try {
      const r = await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,BTC',
        {headers: enctoken ? {'x-kite-token':enctoken} : {}})
      const d = await r.json()
      if (d.data) setMarketData(d.data)
    } catch {}
  }

  function saveToken() {
    const enc = prompt(
      'STEP 1: Open kite.zerodha.com and log in\n' +
      'STEP 2: Press F12 → Network tab → click any request\n' +
      'STEP 3: In Headers → Cookie → copy value after "enctoken="\n\n' +
      'Paste your enctoken below:'
    )
    if (enc?.trim()) {
      localStorage.setItem('kite_enctoken', enc.trim())
      setEnctoken(enc.trim()); setZerodha(true); setShowConnect(false)
    }
  }

  function disconnectZerodha() {
    localStorage.removeItem('kite_enctoken')
    setEnctoken(''); setZerodha(false)
  }

  const tabs = [
    {id:'signals', label:'📡 Signals'},
    {id:'trades',  label:'📋 Trade History'},
    {id:'market',  label:'📊 Market'},
    {id:'charts',  label:'📈 Charts'},
  ]

  return (
    <>
      <Head>
        <title>Projectzero — {activeTab.charAt(0).toUpperCase()+activeTab.slice(1)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{minHeight:'100vh',background:'#0a0e1a',fontFamily:'Space Grotesk,sans-serif',color:'#e2e8f0'}}>
        <div style={{position:'fixed',inset:0,opacity:0.025,pointerEvents:'none',backgroundImage:'linear-gradient(#00d4ff 1px,transparent 1px),linear-gradient(90deg,#00d4ff 1px,transparent 1px)',backgroundSize:'40px 40px'}} />

        {/* Header */}
        <header style={{background:'#0f162888',backdropFilter:'blur(12px)',borderBottom:'1px solid #1e2d4a',padding:'0 24px',display:'flex',alignItems:'center',justifyContent:'space-between',height:60,position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#00d4ff,#0066ff)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,color:'#fff',boxShadow:'0 0 16px rgba(0,212,255,0.3)'}}>P0</div>
            <span style={{fontWeight:700,fontSize:16}}>Projectzero</span>
            <Badge>FHP228</Badge>
            <Badge color='#ffab00'>₹10k–25k Mode</Badge>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{color:'#475569',fontSize:11,fontFamily:'JetBrains Mono,monospace'}}>{time}</span>
            <button onClick={() => zerodhaConnected ? disconnectZerodha() : setShowConnect(true)} style={{
              display:'flex',alignItems:'center',gap:6,padding:'6px 14px',
              background:zerodhaConnected?'#00e67622':'#ff3d5722',
              border:`1px solid ${zerodhaConnected?'#00e67644':'#ff3d5744'}`,
              borderRadius:8,cursor:'pointer',color:'#e2e8f0',fontSize:12,
              fontFamily:'Space Grotesk,sans-serif',fontWeight:500,
            }}>
              <span style={{width:7,height:7,borderRadius:'50%',display:'inline-block',background:zerodhaConnected?'#00e676':'#ff3d57',animation:zerodhaConnected?'pulse 1.5s infinite':'none'}} />
              {zerodhaConnected?'Zerodha Connected':'Connect Zerodha'}
            </button>
            <button onClick={()=>{localStorage.removeItem('pz_token');router.push('/')}} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:12}}>Logout</button>
          </div>
        </header>

        {/* Connect modal */}
        {showConnect && (
          <div style={{position:'fixed',inset:0,background:'#000000bb',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
            <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:20,padding:28,width:460,maxWidth:'92vw'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
                <h3 style={{fontWeight:700}}>Connect Zerodha</h3>
                <button onClick={()=>setShowConnect(false)} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:20}}>×</button>
              </div>
              <div style={{background:'#0a0e1a',borderRadius:10,padding:16,marginBottom:16}}>
                <p style={{color:'#ffab00',fontWeight:600,fontSize:13,marginBottom:10}}>Get your session token (2 minutes):</p>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {['Open kite.zerodha.com and log in normally','Press F12 on keyboard → click "Network" tab','Click on any request in the list','Look in "Request Headers" section → find "Cookie"','Copy the value that comes after "enctoken=" (it\'s a long string)'].map((s,i)=>(
                    <div key={i} style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{background:'#00d4ff22',color:'#00d4ff',borderRadius:'50%',width:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{i+1}</span>
                      <span style={{color:'#94a3b8',fontSize:12,lineHeight:1.5}}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={saveToken} style={{width:'100%',padding:13,background:'linear-gradient(135deg,#00d4ff,#0066ff)',border:'none',borderRadius:10,color:'#fff',fontWeight:600,cursor:'pointer',fontSize:14,fontFamily:'Space Grotesk,sans-serif'}}>
                Click here to paste enctoken & Connect
              </button>
              <p style={{color:'#334155',fontSize:11,textAlign:'center',marginTop:10}}>Valid until midnight. Repeat each morning before 9:15 AM.</p>
            </div>
          </div>
        )}

        {/* Market ticker */}
        <div style={{background:'#0a0e1a',borderBottom:'1px solid #1e2d4a',padding:'9px 24px',display:'flex',gap:28,overflowX:'auto',alignItems:'center'}}>
          {['NIFTY','BANKNIFTY','SENSEX','BTC'].map(sym => {
            const d=marketData[sym]; const up=(d?.pct||0)>=0
            return (
              <div key={sym} style={{display:'flex',gap:8,alignItems:'center',flexShrink:0,cursor:'pointer'}} onClick={()=>setActiveTab('charts')}>
                <span style={{color:'#475569',fontSize:11,fontWeight:700}}>{sym}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'#e2e8f0'}}>{d?fmt(d.price):'—'}</span>
                <span style={{fontSize:11,color:up?'#00e676':'#ff3d57',fontWeight:600}}>{d?`${up?'+':''}${fmt(d.pct,2)}%`:''}</span>
              </div>
            )
          })}
          <span style={{color:'#1e2d4a',fontSize:10,marginLeft:'auto',flexShrink:0}}>Auto-refresh 30s</span>
        </div>

        {/* Tabs */}
        <div style={{padding:'16px 24px 0',display:'flex',gap:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
              padding:'8px 18px',borderRadius:'8px 8px 0 0',
              background:activeTab===t.id?'#0f1628':'transparent',
              border:`1px solid ${activeTab===t.id?'#1e2d4a':'transparent'}`,
              borderBottom:activeTab===t.id?'1px solid #0f1628':'none',
              color:activeTab===t.id?'#e2e8f0':'#475569',
              cursor:'pointer',fontSize:13,fontWeight:500,
              fontFamily:'Space Grotesk,sans-serif',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Main content */}
        <main style={{padding:'0 24px 60px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{background:'#0f1628',border:'1px solid #1e2d4a',borderRadius:'0 12px 12px 12px',padding:24}}>

            {activeTab==='signals' && (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                  <div>
                    <h2 style={{fontSize:18,fontWeight:700}}>Live Signals — Custom PZ Strategies</h2>
                    <p style={{color:'#64748b',fontSize:13,marginTop:4}}>Built from 3-month NSE analysis · Tue/Wed best days · 76% ORB rate · Bearish trend</p>
                  </div>
                  {!zerodhaConnected && (
                    <button onClick={()=>setShowConnect(true)} style={{padding:'8px 14px',background:'#ff3d5722',border:'1px solid #ff3d5744',borderRadius:8,color:'#ff3d57',fontSize:12,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
                      ⚠ Connect Zerodha for execution
                    </button>
                  )}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))',gap:20}}>
                  {PZ_STRATEGIES.map(s=>(
                    <SignalCard key={s.id} strat={s} enctoken={enctoken} onTradeExecuted={()=>setTradeRefresh(r=>r+1)} />
                  ))}
                </div>
              </div>
            )}

            {activeTab==='trades' && (
              <div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                  <div>
                    <h2 style={{fontSize:18,fontWeight:700}}>Trade History & P&L</h2>
                    <p style={{color:'#64748b',fontSize:13,marginTop:4}}>All trades · Entry/Exit · Profit & Loss tracking</p>
                  </div>
                  <button onClick={()=>setTradeRefresh(r=>r+1)} style={{padding:'7px 16px',background:'#1e2d4a',border:'1px solid #2d4a6a',borderRadius:8,color:'#e2e8f0',cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif'}}>
                    🔄 Refresh
                  </button>
                </div>
                <TradeHistory refresh={tradeRefresh} />
              </div>
            )}

            {activeTab==='market' && (
              <div>
                <h2 style={{fontSize:18,fontWeight:700,marginBottom:8}}>Market Overview</h2>
                <p style={{color:'#64748b',fontSize:13,marginBottom:20}}>3-month data: Market BEARISH −5% · Best day: Tuesday · Worst: Thursday/Friday</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:24}}>
                  {Object.entries(marketData).map(([sym,d])=>{
                    const up=(d?.pct||0)>=0
                    return (
                      <div key={sym} onClick={()=>{setActiveTab('charts')}} style={{background:'#0a0e1a',border:`1px solid ${up?'#00e67622':'#ff3d5722'}`,borderTop:`2px solid ${up?'#00e676':'#ff3d57'}`,borderRadius:12,padding:'14px 16px',cursor:'pointer',transition:'all 0.15s'}}>
                        <p style={{color:'#64748b',fontSize:10,fontWeight:700,letterSpacing:'0.1em'}}>{sym}</p>
                        <p style={{color:'#e2e8f0',fontSize:20,fontWeight:700,marginTop:2,fontFamily:'JetBrains Mono,monospace'}}>{fmt(d.price)}</p>
                        <p style={{color:up?'#00e676':'#ff3d57',fontSize:12,fontWeight:700,marginTop:3}}>{up?'+':''}{fmt(d.pct,2)}%</p>
                      </div>
                    )
                  })}
                </div>
                <div style={{background:'#0a0e1a',borderRadius:12,padding:20}}>
                  <p style={{fontWeight:600,marginBottom:14}}>📅 Day of Week Performance (3-month real NSE data)</p>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                    {[{d:'Mon',n:-0.43,b:-0.69,note:'Weakest'},{d:'Tue',n:+0.76,b:+0.97,note:'BEST ★'},{d:'Wed',n:+0.54,b:+0.74,note:'Good'},{d:'Thu',n:-0.58,b:-0.67,note:'Weak'},{d:'Fri',n:-0.55,b:-0.55,note:'Weak'}].map(x=>(
                      <div key={x.d} style={{background:'#0f1628',borderRadius:8,padding:'12px 8px',textAlign:'center',border:`1px solid ${x.n>0?'#00e67633':'#ff3d5733'}`}}>
                        <p style={{fontWeight:700,color:'#e2e8f0',fontSize:14}}>{x.d}</p>
                        <p style={{color:'#64748b',fontSize:10,marginBottom:6}}>{x.note}</p>
                        <p style={{fontSize:11,color:x.n>0?'#00e676':'#ff3d57',fontWeight:600}}>N: {x.n>0?'+':''}{x.n}%</p>
                        <p style={{fontSize:11,color:x.b>0?'#00e676':'#ff3d57',fontWeight:600}}>B: {x.b>0?'+':''}{x.b}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab==='charts' && <ChartsTab />}

          </div>
        </main>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}} *{box-sizing:border-box}`}</style>
    </>
  )
}
