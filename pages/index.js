import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error || 'Wrong password'); setLoading(false); return }
      localStorage.setItem('pz_token', data.token)
      router.push('/dashboard')
    } catch {
      setError('Connection error'); setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Projectzero — Login</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;500;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh', background: '#0a0e1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {/* Background grid */}
        <div style={{
          position: 'fixed', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(#00d4ff 1px, transparent 1px), linear-gradient(90deg, #00d4ff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        <div style={{
          width: '100%', maxWidth: 420, padding: '0 24px',
          position: 'relative', zIndex: 1,
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: 'linear-gradient(135deg, #00d4ff, #0066ff)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, color: '#fff',
              margin: '0 auto 16px', boxShadow: '0 0 40px rgba(0,212,255,0.3)',
            }}>P0</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px' }}>
              Projectzero
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
              Algo Trading Dashboard
            </p>
          </div>

          {/* Card */}
          <div style={{
            background: '#0f1628', border: '1px solid #1e2d4a',
            borderRadius: 20, padding: 32,
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
          }}>
            <form onSubmit={handleLogin}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, fontWeight: 500, marginBottom: 8, letterSpacing: '0.05em' }}>
                DASHBOARD PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: '100%', padding: '14px 16px',
                  background: '#0a0e1a', border: '1px solid #1e2d4a',
                  borderRadius: 10, color: '#e2e8f0', fontSize: 15,
                  outline: 'none', fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#00d4ff'}
                onBlur={e  => e.target.style.borderColor = '#1e2d4a'}
              />

              {error && (
                <p style={{ color: '#ff3d57', fontSize: 13, marginTop: 8 }}>⚠ {error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  marginTop: 20,
                  background: loading ? '#1e2d4a' : 'linear-gradient(135deg, #00d4ff, #0066ff)',
                  border: 'none', borderRadius: 10,
                  color: '#fff', fontSize: 15, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Signing in...' : 'Enter Dashboard →'}
              </button>
            </form>
          </div>

          <p style={{ textAlign: 'center', color: '#334155', fontSize: 12, marginTop: 24 }}>
            Projectzero · FHP228 · NSE/BSE/Crypto
          </p>
        </div>
      </div>
    </>
  )
}
