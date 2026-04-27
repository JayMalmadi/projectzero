// Zerodha session-based trading (no paid API needed)
// User logs in once per day via Kite web

export async function getKiteSession() {
  if (typeof window === 'undefined') return null
  return {
    enctoken: localStorage.getItem('kite_enctoken'),
    userId:   localStorage.getItem('kite_user_id'),
    expires:  localStorage.getItem('kite_expires'),
  }
}

export function saveKiteSession(enctoken, userId) {
  const expires = new Date()
  expires.setHours(23, 59, 59, 0) // valid till end of trading day
  localStorage.setItem('kite_enctoken', enctoken)
  localStorage.setItem('kite_user_id',  userId)
  localStorage.setItem('kite_expires',  expires.toISOString())
}

export function clearKiteSession() {
  localStorage.removeItem('kite_enctoken')
  localStorage.removeItem('kite_user_id')
  localStorage.removeItem('kite_expires')
}

export function isSessionValid() {
  if (typeof window === 'undefined') return false
  const enc     = localStorage.getItem('kite_enctoken')
  const expires = localStorage.getItem('kite_expires')
  if (!enc || !expires) return false
  return new Date() < new Date(expires)
}

// Kite API base via our proxy (avoids CORS)
export const KITE_PROXY = '/api/kite'
