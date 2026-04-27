import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'

// ── Helpers ────────────────────────────────────────────────
const fmt = (n, d=2) => n != null ? Number(n).toLocaleString('en-IN', {maximumFractionDigits:d}) : '—'
const clr = v => v > 0 ? '#00e676' : v < 0 ? '#ff3d57' : '#64748b'

// ── Sub-components ─────────────────────────────────────────
function Card({ children, style={} }) {
  return (
    <div style={{
      background: '#0f1628', border: '1px solid #1e2d4a',
      borderRadius: 16, padding: 20, ...style,
    }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return <p style={{ color:'#64748b', fontSize:11, fontWeight:500, letterSpacing:'0.08em', marginBottom:6 }}>{children}</p>
}

function Badge({ children, color='#00d4ff' }) {
  return (
    <span style={{
      background: color+'22', color, border:`1px solid ${color}44`,
      borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600,
    }}>{children}</span>
  )
}

function MarketTile({ sym, data }) {
  const up = (data?.pct || 0) >= 0
  return (
    <div style={{
      background: '#0a0e1a', border: `1px solid ${up?'#00e67622':'#ff3d5722'}`,
      borderRadius:12, padding:'14px 18px',
      borderTop: `2px solid ${up?'#00e676':'#ff3d57'}`,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ color:'#64748b', fontSize:11, fontWeight:600, letterSpacing:'0.1em' }}>{sym}</p>
          <p style={{ color:'#e2e8f0', fontSize:22, fontWeight:700, marginTop:2, fontFamily:'JetBrains Mono,monospace' }}>
            {data ? fmt(data.price) : '—'}
          </p>
        </div>
        <div style={{ textAlign:'right' }}>
          <p style={{ color: up?'#00e676':'#ff3d57', fontSize:13, fontWeight:600 }}>
            {data ? `${up?'+':''}${fmt(data.pct,2)}%` : '—'}
          </p>
          <p style={{ color:'#475569', fontSize:11, marginTop:2 }}>
            {data ? `${up?'+':''}${fmt(data.change,2)}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}

function SignalCard({ symbol, strategy, onTrade, enctoken }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [trading, setTrading] = useState(false)
  const [tradeMsg, setTradeMsg] = useState('')

  useEffect(() => { fetchSignal() }, [symbol, strategy])

  async function fetchSignal() {
    setLoading(true)
    try {
      const r = await fetch(`/api/signals?symbol=${symbol}&strategy=${strategy}`)
      const d = await r.json()
      setData(d)
    } catch {}
    setLoading(false)
  }

  async function executeTrade() {
    if (!enctoken) { setTradeMsg('⚠ Connect Zerodha first'); return }
    if (!data || data.signal === 'HOLD') { setTradeMsg('No active signal'); return }
    setTrading(true); setTradeMsg('')
    try {
      const r = await fetch('/api/kite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kite-token': enctoken,
        },
        body: JSON.stringify({
          endpoint: '/orders/regular',
          method: 'POST',
          body: {
            tradingsymbol: symbol === 'NIFTY' ? 'NIFTY' : symbol,
            exchange:      'NSE',
            transaction_type: data.signal === 'BUY' ? 'BUY' : 'SELL',
            order_type:    'MARKET',
            quantity:      1,
            product:       'MIS',
          }
        })
      })
      const result = await r.json()
      setTradeMsg(result.data?.order_id ? `✅ Order placed: ${result.data.order_id}` : `❌ ${result.message || 'Error'}`)
    } catch (e) { setTradeMsg(`❌ ${e.message}`) }
    setTrading(false)
  }

  const sigColor = data?.signal === 'BUY' ? '#00e676' : data?.signal === 'SELL' ? '#ff3d57' : '#ffab00'

  return (
    <Card>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <p style={{ color:'#e2e8f0', fontWeight:700, fontSize:16 }}>{symbol}</p>
          <p style={{ color:'#64748b', fontSize:12 }}>{strategy.toUpperCase()} Strategy</p>
        </div>
        {data && !loading && (
          <div style={{
            background: sigColor+'22', color: sigColor,
            border: `1px solid ${sigColor}44`,
            borderRadius:8, padding:'6px 14px',
            fontWeight:700, fontSize:14,
          }}>
            {data.signal}
          </div>
        )}
      </div>

      {loading && <p style={{color:'#64748b',fontSize:13}}>Fetching signal...</p>}

      {data && !loading && (
        <>
          {/* Chart */}
          {data.chartData && (
            <div style={{ height:100, marginBottom:12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chartData}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={['auto','auto']} hide />
                  <Tooltip
                    contentStyle={{ background:'#0a0e1a', border:'1px solid #1e2d4a', borderRadius:8, fontSize:11 }}
                    labelStyle={{ color:'#94a3b8' }}
                  />
                  <Line type="monotone" dataKey="close" stroke="#00d4ff" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="ema9"  stroke="#ffab00" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="ema21" stroke="#ff3d57" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
            <div style={{ background:'#0a0e1a', borderRadius:8, padding:'8px 10px' }}>
              <Label>PRICE</Label>
              <p style={{ color:'#e2e8f0', fontSize:14, fontWeight:600, fontFamily:'monospace' }}>₹{fmt(data.price)}</p>
            </div>
            <div style={{ background:'#0a0e1a', borderRadius:8, padding:'8px 10px' }}>
              <Label>STOP LOSS</Label>
              <p style={{ color:'#ff3d57', fontSize:14, fontWeight:600, fontFamily:'monospace' }}>₹{fmt(data.stopLoss)}</p>
            </div>
            <div style={{ background:'#0a0e1a', borderRadius:8, padding:'8px 10px' }}>
              <Label>TARGET</Label>
              <p style={{ color:'#00e676', fontSize:14, fontWeight:600, fontFamily:'monospace' }}>₹{fmt(data.target)}</p>
            </div>
          </div>

          <p style={{ color:'#94a3b8', fontSize:12, marginBottom:12 }}>
            📊 {data.reason} · RSI: {data.rsi} · Confidence: {data.confidence}%
          </p>

          <button
            onClick={executeTrade}
            disabled={trading || data.signal === 'HOLD'}
            style={{
              width:'100%', padding:'10px',
              background: data.signal === 'HOLD' ? '#1e2d4a'
                        : data.signal === 'BUY'  ? 'linear-gradient(135deg,#00e676,#00b248)'
                        : 'linear-gradient(135deg,#ff3d57,#c62828)',
              border:'none', borderRadius:8,
              color:'#fff', fontWeight:600, fontSize:13,
              cursor: (trading || data.signal === 'HOLD') ? 'not-allowed' : 'pointer',
              fontFamily:'Space Grotesk,sans-serif',
            }}
          >
            {trading ? 'Placing order...' : data.signal === 'HOLD' ? 'No Signal — Hold' : `⚡ Execute ${data.signal}`}
          </button>

          {tradeMsg && <p style={{ color: tradeMsg.startsWith('✅')?'#00e676':'#ff3d57', fontSize:12, marginTop:8 }}>{tradeMsg}</p>}
        </>
      )}
    </Card>
  )
}

// ── Main Dashboard ─────────────────────────────────────────
export default function Dashboard() {
  const router   = useRouter()
  const [marketData,  setMarketData]  = useState({})
  const [enctoken,    setEnctoken]    = useState('')
  const [zerodhaConnected, setZerodhaConnected] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  const [kiteUser,    setKiteUser]    = useState('')
  const [kitePass,    setKitePass]    = useState('')
  const [kiteTotp,    setKiteTotp]    = useState('')
  const [connectErr,  setConnectErr]  = useState('')
  const [connecting,  setConnecting]  = useState(false)
  const [activeTab,   setActiveTab]   = useState('signals')
  const [time,        setTime]        = useState('')

  // Auth guard
  useEffect(() => {
    const token = localStorage.getItem('pz_token')
    if (!token) { router.push('/'); return }

    // Restore Kite session
    const enc = localStorage.getItem('kite_enctoken')
    if (enc) { setEnctoken(enc); setZerodhaConnected(true) }

    // Clock
    const tick = () => setTime(new Date().toLocaleTimeString('en-IN', {hour12:false}))
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t)
  }, [])

  // Fetch market data
  useEffect(() => {
    fetchMarket()
    const t = setInterval(fetchMarket, 30000)
    return () => clearInterval(t)
  }, [enctoken])

  async function fetchMarket() {
    try {
      const r = await fetch('/api/market?symbols=NIFTY,BANKNIFTY,SENSEX,BTC', {
        headers: enctoken ? { 'x-kite-token': enctoken } : {}
      })
      const d = await r.json()
      if (d.data) setMarketData(d.data)
    } catch {}
  }

  async function connectZerodha(e) {
    e.preventDefault()
    setConnecting(true); setConnectErr('')
    // Guide user — actual token obtained via Kite login
    // For session approach, user logs in to kite.zerodha.com and we extract enctoken
    try {
      const r = await fetch('https://kite.zerodha.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user_id: kiteUser, password: kitePass }),
        credentials: 'include',
      })
      // This will fail due to CORS — guide user to manual token approach
      setConnectErr('Use manual token method below ↓')
    } catch {
      setConnectErr('Use manual token: Open kite.zerodha.com → DevTools → Network → any request → copy "enctoken" from Cookie header')
    }
    setConnecting(false)
  }

  function saveManualToken() {
    const enc = prompt('Paste your enctoken from Kite (see guide below):')
    if (enc) {
      localStorage.setItem('kite_enctoken', enc)
      setEnctoken(enc); setZerodhaConnected(true); setShowConnect(false)
    }
  }

  function disconnect() {
    localStorage.removeItem('kite_enctoken')
    setEnctoken(''); setZerodhaConnected(false)
  }

  const SYMBOLS    = ['NIFTY','BANKNIFTY','RELIANCE','TCS','BTC']
  const STRATEGIES = ['ema','rsi']

  const tabs = [
    { id:'signals',   label:'📡 Signals'   },
    { id:'market',    label:'📊 Market'    },
    { id:'portfolio', label:'💼 Portfolio' },
    { id:'backtest',  label:'🧪 Backtest'  },
  ]

  return (
    <>
      <Head>
        <title>Projectzero Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight:'100vh', background:'#0a0e1a', fontFamily:'Space Grotesk,sans-serif', color:'#e2e8f0' }}>

        {/* Background grid */}
        <div style={{
          position:'fixed', inset:0, opacity:0.03, pointerEvents:'none',
          backgroundImage:'linear-gradient(#00d4ff 1px,transparent 1px),linear-gradient(90deg,#00d4ff 1px,transparent 1px)',
          backgroundSize:'40px 40px',
        }} />

        {/* Header */}
        <header style={{
          background:'#0f162888', backdropFilter:'blur(12px)',
          borderBottom:'1px solid #1e2d4a', padding:'0 24px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          height:60, position:'sticky', top:0, zIndex:100,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:32, height:32, borderRadius:8,
              background:'linear-gradient(135deg,#00d4ff,#0066ff)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight:700, fontSize:12, color:'#fff',
              boxShadow:'0 0 16px rgba(0,212,255,0.3)',
            }}>P0</div>
            <span style={{ fontWeight:700, fontSize:16 }}>Projectzero</span>
            <Badge>FHP228</Badge>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ color:'#475569', fontSize:12, fontFamily:'JetBrains Mono,monospace' }}>{time}</span>

            {/* Zerodha connection status */}
            <button
              onClick={() => zerodhaConnected ? disconnect() : setShowConnect(true)}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 14px',
                background: zerodhaConnected ? '#00e67622' : '#ff3d5722',
                border: `1px solid ${zerodhaConnected ? '#00e67644' : '#ff3d5744'}`,
                borderRadius:8, cursor:'pointer', color:'#e2e8f0', fontSize:12,
                fontFamily:'Space Grotesk,sans-serif', fontWeight:500,
              }}
            >
              <span style={{
                width:7, height:7, borderRadius:'50%', display:'inline-block',
                background: zerodhaConnected ? '#00e676' : '#ff3d57',
                animation: zerodhaConnected ? 'pulse-dot 1.5s ease infinite' : 'none',
              }} />
              {zerodhaConnected ? 'Zerodha Live' : 'Connect Zerodha'}
            </button>

            <button onClick={() => { localStorage.removeItem('pz_token'); router.push('/') }}
              style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:12 }}>
              Logout
            </button>
          </div>
        </header>

        {/* Connect Zerodha Modal */}
        {showConnect && (
          <div style={{
            position:'fixed', inset:0, background:'#00000088',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:200,
          }}>
            <div style={{ background:'#0f1628', border:'1px solid #1e2d4a', borderRadius:20, padding:32, width:440, maxWidth:'90vw' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
                <h3 style={{ fontWeight:700 }}>Connect Zerodha</h3>
                <button onClick={() => setShowConnect(false)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:18 }}>×</button>
              </div>

              <div style={{ background:'#0a0e1a', borderRadius:10, padding:16, marginBottom:16 }}>
                <p style={{ color:'#ffab00', fontSize:13, fontWeight:600, marginBottom:8 }}>📋 How to get your enctoken (1 min):</p>
                <ol style={{ color:'#94a3b8', fontSize:12, lineHeight:1.8, paddingLeft:16 }}>
                  <li>Open <strong style={{color:'#00d4ff'}}>kite.zerodha.com</strong> and log in normally</li>
                  <li>Press <strong>F12</strong> to open DevTools → Network tab</li>
                  <li>Click any request (e.g. "orders")</li>
                  <li>Look in <strong>Request Headers</strong> → find <strong>Cookie</strong></li>
                  <li>Copy the value after <strong>enctoken=</strong></li>
                  <li>Paste it below and click Save</li>
                </ol>
              </div>

              <button
                onClick={saveManualToken}
                style={{
                  width:'100%', padding:12,
                  background:'linear-gradient(135deg,#00d4ff,#0066ff)',
                  border:'none', borderRadius:10, color:'#fff', fontWeight:600,
                  cursor:'pointer', fontSize:14, fontFamily:'Space Grotesk,sans-serif',
                }}
              >
                📋 Paste enctoken & Connect
              </button>

              <p style={{ color:'#475569', fontSize:11, textAlign:'center', marginTop:12 }}>
                Valid until midnight. Repeat once per trading day.
              </p>
            </div>
          </div>
        )}

        {/* Market ticker */}
        <div style={{
          background:'#0a0e1a', borderBottom:'1px solid #1e2d4a',
          padding:'10px 24px', display:'flex', gap:32, overflowX:'auto',
        }}>
          {['NIFTY','BANKNIFTY','SENSEX','BTC'].map(sym => {
            const d = marketData[sym]
            const up = (d?.pct||0) >= 0
            return (
              <div key={sym} style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
                <span style={{ color:'#64748b', fontSize:12, fontWeight:600 }}>{sym}</span>
                <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, color:'#e2e8f0' }}>
                  {d ? fmt(d.price) : '—'}
                </span>
                <span style={{ fontSize:12, color: up?'#00e676':'#ff3d57' }}>
                  {d ? `${up?'+':''}${fmt(d.pct,2)}%` : ''}
                </span>
              </div>
            )
          })}
          <span style={{ color:'#334155', fontSize:11, marginLeft:'auto', alignSelf:'center', flexShrink:0 }}>
            Auto-refresh 30s
          </span>
        </div>

        {/* Tabs */}
        <div style={{ padding:'20px 24px 0', display:'flex', gap:4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:'8px 16px', borderRadius:'8px 8px 0 0',
              background: activeTab===t.id ? '#0f1628' : 'transparent',
              border: activeTab===t.id ? '1px solid #1e2d4a' : '1px solid transparent',
              borderBottom: activeTab===t.id ? '1px solid #0f1628' : '1px solid transparent',
              color: activeTab===t.id ? '#e2e8f0' : '#64748b',
              cursor:'pointer', fontSize:13, fontWeight:500,
              fontFamily:'Space Grotesk,sans-serif',
              transition:'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Main Content */}
        <main style={{ padding:'0 24px 40px', maxWidth:1400, margin:'0 auto' }}>
          <div style={{
            background:'#0f1628', border:'1px solid #1e2d4a',
            borderRadius:'0 12px 12px 12px', padding:24,
          }}>

            {/* SIGNALS TAB */}
            {activeTab === 'signals' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <div>
                    <h2 style={{ fontSize:18, fontWeight:700 }}>Live Signals</h2>
                    <p style={{ color:'#64748b', fontSize:13, marginTop:2 }}>Real-time algo signals across all instruments</p>
                  </div>
                  {!zerodhaConnected && (
                    <div style={{
                      background:'#ffab0022', border:'1px solid #ffab0044',
                      borderRadius:8, padding:'8px 14px', fontSize:12, color:'#ffab00',
                    }}>
                      ⚠ Connect Zerodha to enable trade execution
                    </div>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px,1fr))', gap:16 }}>
                  {SYMBOLS.map(sym => (
                    <SignalCard key={sym} symbol={sym} strategy="ema" enctoken={enctoken} />
                  ))}
                </div>
              </div>
            )}

            {/* MARKET TAB */}
            {activeTab === 'market' && (
              <div>
                <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>Market Overview</h2>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12 }}>
                  {Object.entries(marketData).map(([sym, data]) => (
                    <MarketTile key={sym} sym={sym} data={data} />
                  ))}
                </div>
                {Object.keys(marketData).length === 0 && (
                  <p style={{ color:'#64748b', textAlign:'center', padding:40 }}>
                    Loading market data...
                  </p>
                )}
              </div>
            )}

            {/* PORTFOLIO TAB */}
            {activeTab === 'portfolio' && (
              <div>
                <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Portfolio</h2>
                <p style={{ color:'#64748b', fontSize:13, marginBottom:24 }}>
                  {zerodhaConnected ? 'Live portfolio from Zerodha' : 'Connect Zerodha to see your live portfolio'}
                </p>
                {!zerodhaConnected ? (
                  <div style={{ textAlign:'center', padding:60 }}>
                    <p style={{ fontSize:40, marginBottom:16 }}>📊</p>
                    <button onClick={() => setShowConnect(true)} style={{
                      padding:'12px 28px', background:'linear-gradient(135deg,#00d4ff,#0066ff)',
                      border:'none', borderRadius:10, color:'#fff', fontWeight:600,
                      cursor:'pointer', fontSize:14, fontFamily:'Space Grotesk,sans-serif',
                    }}>Connect Zerodha to View Portfolio</button>
                  </div>
                ) : (
                  <div style={{ background:'#0a0e1a', borderRadius:12, padding:20 }}>
                    <p style={{ color:'#64748b', fontSize:13 }}>Portfolio data loads from Zerodha once connected and markets open (9:15 AM IST)</p>
                  </div>
                )}
              </div>
            )}

            {/* BACKTEST TAB */}
            {activeTab === 'backtest' && (
              <div>
                <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>Backtester</h2>
                <p style={{ color:'#64748b', fontSize:13, marginBottom:24 }}>Run strategies on historical data</p>
                <div style={{
                  background:'#0a0e1a', border:'1px solid #1e2d4a',
                  borderRadius:12, padding:24, textAlign:'center',
                }}>
                  <p style={{ fontSize:32, marginBottom:12 }}>🧪</p>
                  <p style={{ color:'#94a3b8', marginBottom:4 }}>Full backtesting engine is built and ready</p>
                  <p style={{ color:'#64748b', fontSize:13 }}>
                    Run <code style={{color:'#00d4ff', fontFamily:'monospace'}}>python run_backtest.py --quick</code> from the trading_system folder
                    for full multi-strategy backtests
                  </p>
                  <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    {[['6 Strategies','EMA, RSI+MACD, Bollinger, Breakout, Supertrend, VWAP'],
                      ['3 Markets','NSE Stocks, Crypto, Forex'],
                      ['Full Metrics','Sharpe, Drawdown, Win Rate, P&L']].map(([t,d]) => (
                      <div key={t} style={{ background:'#0f1628', borderRadius:10, padding:16 }}>
                        <p style={{ color:'#00d4ff', fontWeight:600, marginBottom:4 }}>{t}</p>
                        <p style={{ color:'#64748b', fontSize:12 }}>{d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.5;transform:scale(1.3)}
        }
      `}</style>
    </>
  )
}
