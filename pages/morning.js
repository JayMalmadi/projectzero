// Morning Intelligence Report page
// Full global analysis + trading plan for the day
// Accessible at /morning

import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const DARK = {
  bg:'#080c14',card:'#0e1420',surface:'#161b22',border:'#1c2535',
  text:'#f0f4fc',text2:'#8b95a8',muted:'#4a5568',
  green:'#00d17a',red:'#ff4060',blue:'#4da6ff',amber:'#ffaa00',
  purple:'#9f7eff',teal:'#00d17a',
}

export default function MorningPage() {
  const router   = useRouter()
  const t        = DARK
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [section, setSection] = useState('india') // india | crypto | global

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(''); setData(null)
    try {
      const r = await fetch('/api/morning-intelligence')
      const d = await r.json()
      if (d.status === 'success') setData(d)
      else setError(d.error || 'Failed to load')
    } catch(e) { setError(e.message) }
    setLoading(false)
  }

  const sentColor = data?.globalSentiment === 'BULLISH' ? t.green
                  : data?.globalSentiment === 'BEARISH' ? t.red : t.amber

  return (
    <>
      <Head>
        <title>Morning Intelligence — Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
        <style>{`*{margin:0;padding:0;box-sizing:border-box}body{background:${t.bg};font-family:'Inter',sans-serif;color:${t.text};min-height:100vh}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </Head>

      {/* Header */}
      <div style={{background:t.card,borderBottom:`1px solid ${t.border}`,padding:'14px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <button onClick={()=>router.push('/dashboard')} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',padding:'6px 14px',fontSize:12,fontFamily:'Inter,sans-serif'}}>← Dashboard</button>
          <div>
            <span style={{fontWeight:900,fontSize:18,color:t.text}}>☀️ Morning Intelligence</span>
            {data && <span style={{color:t.muted,fontSize:12,marginLeft:10}}>{data.day} · {data.date}</span>}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {data && <span style={{background:sentColor+'22',color:sentColor,border:`1px solid ${sentColor}44`,borderRadius:20,padding:'4px 14px',fontSize:12,fontWeight:700}}>Global: {data.globalSentiment}</span>}
          <button onClick={load} disabled={loading} style={{background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:8,color:t.blue,cursor:'pointer',padding:'6px 14px',fontSize:12,fontFamily:'Inter,sans-serif',fontWeight:600}}>
            {loading?'Loading...':'↻ Refresh'}
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'24px 20px'}}>

        {loading && (
          <div style={{textAlign:'center',padding:80}}>
            <div style={{width:48,height:48,border:`4px solid ${t.border}`,borderTopColor:t.blue,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 20px'}}/>
            <p style={{color:t.text,fontWeight:700,fontSize:18,marginBottom:8}}>Analysing global markets...</p>
            <p style={{color:t.muted,fontSize:13}}>Fetching US markets, Asian session, commodities, currencies, news, and generating AI analysis</p>
          </div>
        )}

        {error && (
          <div style={{background:t.red+'11',border:`1px solid ${t.red}33`,borderRadius:16,padding:32,textAlign:'center'}}>
            <p style={{fontSize:32,marginBottom:12}}>⚠️</p>
            <p style={{color:t.red,fontWeight:700,fontSize:16,marginBottom:8}}>Failed to load</p>
            <p style={{color:t.muted,fontSize:13,marginBottom:16}}>{error}</p>
            <button onClick={load} style={{padding:'10px 24px',background:t.blue+'22',border:`1px solid ${t.blue}44`,borderRadius:10,color:t.blue,cursor:'pointer',fontWeight:700}}>Try Again</button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Key signals strip */}
            {data.keySignals?.length > 0 && (
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
                {data.keySignals.map((s,i)=>(
                  <div key={i} style={{background:s.impact==='bullish'?t.green+'11':s.impact==='bearish'?t.red+'11':t.amber+'11',border:`1px solid ${s.impact==='bullish'?t.green:s.impact==='bearish'?t.red:t.amber}44`,borderRadius:10,padding:'8px 14px',fontSize:12}}>
                    <span style={{color:s.impact==='bullish'?t.green:s.impact==='bearish'?t.red:t.amber,fontWeight:700}}>{s.factor}: {s.value}</span>
                    <span style={{color:t.muted,marginLeft:6}}>{s.note}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Section tabs */}
            <div style={{display:'flex',gap:4,marginBottom:20,background:t.surface,padding:4,borderRadius:12,border:`1px solid ${t.border}`,width:'fit-content'}}>
              {[{id:'india',l:'🇮🇳 Indian Markets'},{id:'crypto',l:'🪙 Crypto'},{id:'global',l:'🌍 Global Data'}].map(s=>(
                <button key={s.id} onClick={()=>setSection(s.id)}
                  style={{padding:'8px 20px',borderRadius:9,border:'none',background:section===s.id?t.card:'transparent',color:section===s.id?t.text:t.muted,fontWeight:section===s.id?700:500,cursor:'pointer',fontSize:13,fontFamily:'Inter,sans-serif',transition:'all 0.15s'}}>
                  {s.l}
                </button>
              ))}
            </div>

            {/* India brief */}
            {section==='india' && (
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,alignItems:'start'}}>
                <div style={{background:t.card,borderRadius:20,padding:28,border:`1px solid ${t.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                    <span style={{fontSize:24}}>🇮🇳</span>
                    <div>
                      <p style={{fontWeight:900,fontSize:18,color:t.text}}>Indian Market Intelligence</p>
                      <p style={{color:t.muted,fontSize:12}}>Claude's analysis based on all global factors</p>
                    </div>
                  </div>
                  <div style={{color:t.text2,fontSize:14,lineHeight:1.9,whiteSpace:'pre-wrap'}}>{data.indiaBrief}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {/* Quick stats */}
                  {[
                    {l:'NIFTY', v:`₹${data.rawData?.india?.nifty?.price?.toLocaleString('en-IN')||'—'}`, pct:data.rawData?.india?.nifty?.pct},
                    {l:'BANKNIFTY', v:`₹${data.rawData?.india?.banknifty?.price?.toLocaleString('en-IN')||'—'}`, pct:data.rawData?.india?.banknifty?.pct},
                    {l:'USD/INR', v:data.rawData?.india?.usdinr?.price||'—', pct:data.rawData?.india?.usdinr?.pct},
                    {l:'CRUDE OIL', v:`$${data.rawData?.commodities?.crude?.price||'—'}`, pct:data.rawData?.commodities?.crude?.pct},
                    {l:'S&P 500', v:data.rawData?.us?.sp500?.price?.toLocaleString()||'—', pct:data.rawData?.us?.sp500?.pct},
                    {l:'VIX', v:data.rawData?.us?.vix?.price||'—', pct:null, note:data.rawData?.us?.vix?.price>25?'HIGH':data.rawData?.us?.vix?.price>20?'ELEV':'LOW'},
                  ].map(x=>(
                    <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{color:t.muted,fontSize:12,fontWeight:600}}>{x.l}</span>
                      <div style={{textAlign:'right'}}>
                        <span style={{color:t.text,fontFamily:'monospace',fontWeight:700,fontSize:14}}>{x.v}</span>
                        {x.pct!=null && <span style={{color:x.pct>0?t.green:x.pct<0?t.red:t.muted,fontSize:11,marginLeft:6,fontWeight:600}}>{x.pct>0?'+':''}{x.pct}%</span>}
                        {x.note && <span style={{color:x.note==='HIGH'?t.red:x.note==='ELEV'?t.amber:t.green,fontSize:11,marginLeft:6,fontWeight:700}}>{x.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crypto brief */}
            {section==='crypto' && (
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20,alignItems:'start'}}>
                <div style={{background:t.card,borderRadius:20,padding:28,border:`1px solid ${t.border}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
                    <span style={{fontSize:24}}>🪙</span>
                    <div>
                      <p style={{fontWeight:900,fontSize:18,color:t.text}}>Crypto Intelligence</p>
                      <p style={{color:t.muted,fontSize:12}}>Claude's analysis of crypto market conditions</p>
                    </div>
                  </div>
                  <div style={{color:t.text2,fontSize:14,lineHeight:1.9,whiteSpace:'pre-wrap'}}>{data.cryptoBrief}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {[
                    {l:'BITCOIN', v:`$${data.rawData?.crypto?.btc?.price?.toLocaleString()||'—'}`, pct:data.rawData?.crypto?.btc?.pct},
                    {l:'ETHEREUM', v:`$${data.rawData?.crypto?.eth?.price?.toLocaleString()||'—'}`, pct:data.rawData?.crypto?.eth?.pct},
                    {l:'FEAR & GREED', v:data.rawData?.fearGreed?.value||'—', note:data.rawData?.fearGreed?.value_classification, pct:null},
                    {l:'DXY (Dollar)', v:data.rawData?.currencies?.dxy?.price||'—', pct:data.rawData?.currencies?.dxy?.pct},
                    {l:'US 10Y YIELD', v:`${data.rawData?.us?.yield10y?.price||'—'}%`, pct:data.rawData?.us?.yield10y?.pct},
                  ].map(x=>(
                    <div key={x.l} style={{background:t.card,borderRadius:12,padding:'12px 16px',border:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{color:t.muted,fontSize:12,fontWeight:600}}>{x.l}</span>
                      <div style={{textAlign:'right'}}>
                        <span style={{color:t.text,fontFamily:'monospace',fontWeight:700,fontSize:14}}>{x.v}</span>
                        {x.pct!=null && <span style={{color:x.pct>0?t.green:x.pct<0?t.red:t.muted,fontSize:11,marginLeft:6,fontWeight:600}}>{x.pct>0?'+':''}{x.pct}%</span>}
                        {x.note && <span style={{color:t.muted,fontSize:11,marginLeft:6}}>{x.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Global data */}
            {section==='global' && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
                {[
                  {title:'🇺🇸 US Markets',data:[
                    {l:'S&P 500',v:data.rawData?.us?.sp500},{l:'NASDAQ',v:data.rawData?.us?.nasdaq},
                    {l:'Dow Jones',v:data.rawData?.us?.dow},{l:'VIX',v:data.rawData?.us?.vix},{l:'US 10Y',v:data.rawData?.us?.yield10y}
                  ]},
                  {title:'🛢️ Commodities',data:[
                    {l:'Crude WTI',v:data.rawData?.commodities?.crude},{l:'Brent',v:data.rawData?.commodities?.brent},
                    {l:'Gold',v:data.rawData?.commodities?.gold},{l:'Silver',v:data.rawData?.commodities?.silver},
                    {l:'Natural Gas',v:data.rawData?.commodities?.natgas}
                  ]},
                  {title:'💱 Currencies',data:[
                    {l:'DXY Dollar',v:data.rawData?.currencies?.dxy},{l:'USD/INR',v:data.rawData?.currencies?.usdinr},
                    {l:'EUR/USD',v:data.rawData?.currencies?.eurusd},{l:'USD/JPY',v:data.rawData?.currencies?.usdjpy}
                  ]},
                  {title:'🌏 Asian Markets',data:[
                    {l:'Nikkei 225',v:data.rawData?.asia?.nikkei},{l:'Hang Seng',v:data.rawData?.asia?.hangseng},
                    {l:'Shanghai',v:data.rawData?.asia?.shanghai},{l:'KOSPI',v:data.rawData?.asia?.kospi}
                  ]},
                ].map(group=>(
                  <div key={group.title} style={{background:t.card,borderRadius:16,border:`1px solid ${t.border}`,overflow:'hidden'}}>
                    <div style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`,fontWeight:700,color:t.text,fontSize:14}}>{group.title}</div>
                    {group.data.map(item=>(
                      <div key={item.l} style={{padding:'10px 16px',borderBottom:`1px solid ${t.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{color:t.muted,fontSize:12}}>{item.l}</span>
                        <div style={{textAlign:'right'}}>
                          <span style={{color:t.text,fontFamily:'monospace',fontSize:13,fontWeight:600}}>{item.v?.price ?? '—'}</span>
                          {item.v?.pct != null && <span style={{color:item.v.pct>0?t.green:item.v.pct<0?t.red:t.muted,fontSize:11,marginLeft:6}}>{item.v.pct>0?'+':''}{item.v.pct}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* News */}
            {data.topNews?.length > 0 && (
              <div style={{marginTop:24,background:t.card,borderRadius:16,border:`1px solid ${t.border}`,overflow:'hidden'}}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${t.border}`,fontWeight:700,color:t.text}}>📰 Market-Moving News</div>
                {data.topNews.map((n,i)=>(
                  <div key={i} style={{padding:'10px 18px',borderBottom:i<data.topNews.length-1?`1px solid ${t.border}`:'none',display:'flex',gap:10,alignItems:'flex-start'}}>
                    <span style={{fontSize:13,flexShrink:0,marginTop:1}}>{n.sentiment==='bullish'?'🟢':n.sentiment==='bearish'?'🔴':'⚪'}</span>
                    <div style={{flex:1}}>
                      <a href={n.link} target="_blank" rel="noopener noreferrer" style={{color:t.text,fontSize:13,textDecoration:'none',lineHeight:1.5}}>{n.title}</a>
                      <span style={{color:t.muted,fontSize:11,marginLeft:8}}>{n.timeAgo} · {n.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p style={{color:t.muted,fontSize:11,textAlign:'center',marginTop:16}}>Generated at {new Date(data.generatedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST · Refresh before 9:00 AM for latest data</p>
          </>
        )}
      </div>
    </>
  )
}
