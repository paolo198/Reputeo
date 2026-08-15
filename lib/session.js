import { createClient } from '@supabase/supabase-js'

export async function requireUser(req, res) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) { res.status(401).json({ error: 'Connexion requise' }); return null }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) { res.status(401).json({ error: 'Session invalide ou expirée' }); return null }
  return user
}
