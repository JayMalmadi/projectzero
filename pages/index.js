import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [dark,     setDark]     = useState(true)
  const router = useRouter()

  async function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const d = await r.json()
      if (d.token) {
        localStorage.setItem('pz_token', d.token)
        router.push('/dashboard')
      } else {
        setError('Incorrect password')
        setLoading(false)
      }
    } catch {
      setError('Connection error. Try again.')
      setLoading(false)
    }
  }

  const bg = dark ? '#080c14' : '#fafafa'
  const card = dark ? '#111927' : '#ffffff'
  const border = dark ? '#1c2535' : '#ebebeb'
  const text = dark ? '#f0f4fc' : '#1a1a2e'
  const muted = dark ? '#4a5568' : '#9aa0ad'
  const subtext = dark ? '#8b95a8' : '#555e6e'
  const orange = '#ff6600'

  return (
    <>
      <Head>
        <title>Projectzero — Login</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0 }
          body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased }
          @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
          @keyframes spin { to{transform:rotate(360deg)} }
          input:focus { outline: none; border-color: ${orange} !important; box-shadow: 0 0 0 3px ${orange}22 !important }
          button:hover:not(:disabled) { transform: translateY(-1px) }
          button:active:not(:disabled) { transform: translateY(0) }
          button { transition: all 0.15s ease }
        `}</style>
      </Head>

      <div style={{
        minHeight:'100vh',
        background: bg,
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        padding:20,
        position:'relative',
        overflow:'hidden',
      }}>

        {/* Background decoration */}
        <div style={{
          position:'absolute',
          top:-200,right:-200,
          width:600,height:600,
          borderRadius:'50%',
          background: dark
            ? 'radial-gradient(circle, rgba(255,102,0,0.08) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(255,102,0,0.12) 0%, transparent 70%)',
          pointerEvents:'none',
        }}/>
        <div style={{
          position:'absolute',
          bottom:-200,left:-200,
          width:500,height:500,
          borderRadius:'50%',
          background: dark
            ? 'radial-gradient(circle, rgba(77,166,255,0.06) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(77,166,255,0.08) 0%, transparent 70%)',
          pointerEvents:'none',
        }}/>

        {/* Dark mode toggle */}
        <button
          onClick={()=>setDark(d=>!d)}
          style={{
            position:'absolute',top:20,right:20,
            width:38,height:38,borderRadius:10,
            border:`1px solid ${border}`,
            background:card,color:text,
            cursor:'pointer',fontSize:16,
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
          {dark?'☀️':'🌙'}
        </button>

        {/* Login card */}
        <div style={{
          background: card,
          borderRadius: 24,
          padding: '44px 40px',
          width: '100%',
          maxWidth: 420,
          border: `1px solid ${border}`,
          boxShadow: dark ? '0 24px 80px rgba(0,0,0,0.5)' : '0 24px 80px rgba(0,0,0,0.1)',
          animation: 'fadeUp 0.4s ease forwards',
        }}>

          {/* Logo */}
          <div style={{textAlign:'center',marginBottom:36}}>
            <div style={{
              width:56,height:56,
              borderRadius:16,
              background:'linear-gradient(135deg,#ff6600,#ff9500)',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:26,fontWeight:900,color:'#fff',
              margin:'0 auto 16px',
              boxShadow:'0 8px 24px rgba(255,102,0,0.35)',
            }}>P</div>
            <h1 style={{fontWeight:800,fontSize:24,color:text,marginBottom:6,letterSpacing:'-0.5px'}}>Projectzero</h1>
            <p style={{color:subtext,fontSize:13,fontWeight:400}}>Algorithmic Trading Platform</p>
          </div>

          {/* Form */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:subtext,marginBottom:8,letterSpacing:'0.04em'}}>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&handleLogin()}
                placeholder="Enter your access password"
                style={{
                  width:'100%',
                  padding:'12px 16px',
                  borderRadius:12,
                  border:`1.5px solid ${border}`,
                  background:dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
                  color:text,
                  fontSize:14,
                  fontFamily:'Inter,sans-serif',
                  transition:'border-color 0.2s,box-shadow 0.2s',
                }}
              />
            </div>

            {error && (
              <div style={{
                background:'rgba(255,64,96,0.1)',
                border:'1px solid rgba(255,64,96,0.3)',
                borderRadius:10,
                padding:'10px 14px',
                fontSize:13,
                color:'#ff4060',
                fontWeight:500,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !password}
              style={{
                padding:'13px',
                borderRadius:12,
                border:'none',
                background: loading || !password
                  ? dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)'
                  : 'linear-gradient(135deg,#ff6600,#ff9500)',
                color: loading || !password ? muted : '#fff',
                fontWeight:700,
                fontSize:15,
                cursor: loading || !password ? 'not-allowed' : 'pointer',
                fontFamily:'Inter,sans-serif',
                boxShadow: loading || !password ? 'none' : '0 4px 20px rgba(255,102,0,0.35)',
              }}>
              {loading ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  <div style={{width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'rgba(255,255,255,0.8)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  Signing in...
                </div>
              ) : 'Sign In →'}
            </button>
          </div>

          {/* Footer */}
          <div style={{marginTop:28,paddingTop:20,borderTop:`1px solid ${border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:muted,fontSize:11}}>FHP228 · Ahmedabad</span>
            <div style={{display:'flex',gap:12}}>
              {['🇮🇳 NSE','🪙 Crypto','🤖 AI'].map(l=>(
                <span key={l} style={{color:muted,fontSize:11}}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
