import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

const DARK = {
  bg:'#07090f', surface:'#0d1117', card:'#111827', border:'#1f2937',
  text:'#f9fafb', text2:'#9ca3af', muted:'#4b5563',
  green:'#10f59e', red:'#ff4466', blue:'#3b9eff', amber:'#fbbf24',
  purple:'#a78bfa', accentC:'#3b9eff',
}
const LIGHT = {
  bg:'#f0f4ff', surface:'#ffffff', card:'#ffffff', border:'#e5e7eb',
  text:'#111827', text2:'#6b7280', muted:'#9ca3af',
  green:'#059669', red:'#dc2626', blue:'#2563eb', amber:'#d97706',
  purple:'#7c3aed', accentC:'#2563eb',
}

export default function AIPage() {
  const router = useRouter()
  const [dark, setDark]       = useState(true)
  const [briefing, setBriefing] = useState('')
  const [bLoading, setBLoading] = useState(false)
  const [msgs, setMsgs]       = useState([
    {role:'assistant', content:'Hi Jay! I am your AI trading partner. Ask me anything about your trades, strategies, or the market.'}
  ])
  const [input, setInput]     = useState('')
  const [cLoading, setCLoading] = useState(false)
  const msgEndRef = useRef(null)
  const t = dark ? DARK : LIGHT

  useEffect(() => {
    if (!localStorage.getItem('pz_token')) { router.push('/'); return }
    const saved = localStorage.getItem('pz_dark')
    if (saved !== null) setDark(saved === 'true')
    fetchBriefing()
  }, [])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  async function fetchBriefing() {
    setBLoading(true)
    setBriefing('')
    try {
      const now  = new Date()
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const r    = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          type: 'morning_briefing',
          data: {
            date: now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}),
            dayOfWeek: days[now.getDay()],
            dayInsight: now.getDay()===2 ? 'Tuesday — historically best day (+0.97% BankNifty avg)' :
                        now.getDay()===3 ? 'Wednesday — second best day (+0.74% avg)' :
                        now.getDay()===1 ? 'Monday — historically weak (-0.43% avg)' :
                        now.getDay()===4 ? 'Thursday — weak day (-0.55% avg)' :
                        now.getDay()===5 ? 'Friday — weak day (-0.55% avg)' : 'Weekend',
            niftyPrice:'—', niftyChange:'—',
            bankNiftyPrice:'—', bankNiftyChange:'—',
          }
        })
      })
      const d = await r.json()
      if (d.analysis) setBriefing(d.analysis)
      else setBriefing('Could not generate briefing. Check Anthropic API key in Vercel.')
    } catch(e) {
      setBriefing('Error: ' + e.message)
    }
    setBLoading(false)
  }

  async function sendChat() {
    const msg = input.trim()
    if (!msg || cLoading) return
    const newMsgs = [...msgs, {role:'user', content:msg}]
    setMsgs(newMsgs)
    setInput('')
    setCLoading(true)
    try {
      const r = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          type: 'chat',
          data: {message: msg, capital: 25000}
        })
      })
      const d = await r.json()
      setMsgs(m => [...m, {role:'assistant', content: d.analysis || 'No response. Check API key.'}])
    } catch(e) {
      setMsgs(m => [...m, {role:'assistant', content:'Error: ' + e.message}])
    }
    setCLoading(false)
  }

  const QUICK = [
    'Should I trade today?',
    'Which strategy suits current market?',
    'Explain PZ-ORB Filter strategy',
    'What risk per trade for Rs 25,000 capital?',
    'How to avoid overtrading?',
    'Best time to trade Nifty?',
  ]

  return (
    <>
      <Head>
        <title>AI Partner — Projectzero</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{minHeight:'100vh',background:t.bg,fontFamily:'Space Grotesk,sans-serif',color:t.text}}>

        {/* Header */}
        <header style={{background:dark?'rgba(11,14,22,0.95)':'rgba(255,255,255,0.95)',backdropFilter:'blur(16px)',borderBottom:`1px solid ${t.border}`,padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button onClick={()=>router.push('/dashboard')} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:'pointer',fontSize:12,padding:'5px 12px',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>← Dashboard</button>
            <span style={{fontSize:16}}>🤖</span>
            <span style={{fontWeight:800,fontSize:16,color:t.text}}>AI Trading Partner</span>
          </div>
          <button onClick={()=>{const nd=!dark;setDark(nd);localStorage.setItem('pz_dark',String(nd))}} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:'5px 14px',cursor:'pointer',fontSize:13,color:t.text,fontFamily:'Space Grotesk,sans-serif'}}>
            {dark?'☀️ Light':'🌙 Dark'}
          </button>
        </header>

        <main style={{maxWidth:900,margin:'0 auto',padding:'24px 20px 60px'}}>

          {/* Morning Briefing */}
          <div style={{background:t.purple+'0d',border:`1px solid ${t.purple}33`,borderRadius:16,padding:22,marginBottom:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:20}}>☀️</span>
                <span style={{color:t.purple,fontWeight:800,fontSize:15}}>Morning Briefing</span>
                <span style={{color:t.muted,fontSize:11}}>· Auto-generated by Claude</span>
              </div>
              <button onClick={fetchBriefing} disabled={bLoading} style={{padding:'5px 14px',background:t.purple+'22',border:`1px solid ${t.purple}44`,borderRadius:8,color:t.purple,cursor:'pointer',fontSize:12,fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
                {bLoading ? '...' : '🔄 Refresh'}
              </button>
            </div>
            {bLoading
              ? <div style={{display:'flex',alignItems:'center',gap:10,color:t.muted,padding:'8px 0'}}>
                  <div style={{width:18,height:18,border:`2px solid ${t.purple}44`,borderTopColor:t.purple,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  Generating briefing...
                </div>
              : <pre style={{color:t.text2,fontSize:13,lineHeight:1.9,whiteSpace:'pre-wrap',fontFamily:'Space Grotesk,sans-serif',margin:0}}>{briefing||'Click Refresh to generate briefing'}</pre>
            }
          </div>

          {/* Chat */}
          <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:16,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>💬</span>
              <span style={{color:t.text,fontWeight:700,fontSize:14}}>Ask Claude Anything</span>
              <span style={{color:t.muted,fontSize:11}}>· Knows your strategies, capital, and market context</span>
            </div>

            {/* Messages */}
            <div style={{height:400,overflowY:'auto',padding:'16px',display:'flex',flexDirection:'column',gap:12}}>
              {msgs.map((m,i) => (
                <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                  <div style={{
                    maxWidth:'82%',padding:'10px 14px',fontSize:13,lineHeight:1.8,
                    borderRadius:m.role==='user'?'14px 14px 4px 14px':'14px 14px 14px 4px',
                    background:m.role==='user'?`linear-gradient(135deg,${t.accentC},${t.purple})`:t.surface,
                    border:m.role==='user'?'none':`1px solid ${t.border}`,
                    color:m.role==='user'?'#fff':t.text2,
                    whiteSpace:'pre-wrap',
                  }}>{m.content}</div>
                </div>
              ))}
              {cLoading && (
                <div style={{display:'flex',justifyContent:'flex-start'}}>
                  <div style={{padding:'12px 16px',borderRadius:'14px 14px 14px 4px',background:t.surface,border:`1px solid ${t.border}`,display:'flex',gap:5,alignItems:'center'}}>
                    {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:'50%',background:t.purple,display:'inline-block',animation:`bounce 0.9s ${i*0.15}s infinite`}}/>)}
                  </div>
                </div>
              )}
              <div ref={msgEndRef}/>
            </div>

            {/* Quick prompts */}
            <div style={{padding:'10px 16px',borderTop:`1px solid ${t.border}`,borderBottom:`1px solid ${t.border}`,display:'flex',gap:6,flexWrap:'wrap',background:t.surface+'55'}}>
              {QUICK.map(q=>(
                <button key={q} onClick={()=>{setInput(q)}} style={{padding:'4px 12px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,color:t.text2,cursor:'pointer',fontSize:11,fontFamily:'Space Grotesk,sans-serif'}}>
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div style={{padding:'12px 16px',display:'flex',gap:8}}>
              <input
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()} }}
                placeholder="Ask anything about trading, your strategies, or the market..."
                style={{flex:1,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,color:t.text,fontSize:13,padding:'10px 14px',fontFamily:'Space Grotesk,sans-serif',outline:'none'}}
              />
              <button onClick={sendChat} disabled={!input.trim()||cLoading} style={{padding:'10px 20px',background:!input.trim()||cLoading?t.surface:`linear-gradient(135deg,${t.accentC},${t.purple})`,border:`1px solid ${t.border}`,borderRadius:10,color:!input.trim()||cLoading?t.muted:'#fff',fontWeight:700,cursor:!input.trim()||cLoading?'not-allowed':'pointer',fontSize:13,fontFamily:'Space Grotesk,sans-serif'}}>
                Send
              </button>
            </div>
          </div>
        </main>
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#374151;border-radius:2px}
      `}</style>
    </>
  )
}
