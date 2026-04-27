import jwt  from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const DASHBOARD_PASS_HASH = process.env.DASHBOARD_PASSWORD_HASH
const JWT_SECRET          = process.env.JWT_SECRET || 'projectzero-secret-change-me'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'Password required' })

  const valid = DASHBOARD_PASS_HASH
    ? await bcrypt.compare(password, DASHBOARD_PASS_HASH)
    : password === (process.env.DASHBOARD_PASSWORD || 'Pz@2026!')

  if (!valid) return res.status(401).json({ error: 'Invalid password' })

  const token = jwt.sign({ user: 'admin', app: 'projectzero' },
                          JWT_SECRET, { expiresIn: '7d' })

  return res.status(200).json({ token })
}
