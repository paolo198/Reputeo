import { createClient } from '@supabase/supabase-js'

const FOUNDER_EMAIL = 'paolo.cugini25@gmail.com'

export function isFounder(user) {
  return String(user?.email || '').trim().toLowerCase() === FOUNDER_EMAIL
}

export async function hasPremiumAccess(user) {
  if (isFounder(user)) return true
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!subscription) return false
  return subscription.status === 'active' || Boolean(subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date())
}

export async function requirePremiumAccess(user, res) {
  if (await hasPremiumAccess(user)) return true
  res.status(402).json({ error: 'Cette fonctionnalité est disponible avec l’abonnement Reputeo.' })
  return false
}
