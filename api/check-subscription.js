export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { user_id } = req.query
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    const { data: sub } = await sb
      .from('subscriptions')
      .select('status, trial_ends_at')
      .eq('user_id', user_id)
      .single()

    if (!sub) return res.status(200).json({ isPremium: false })

    const isActive = sub.status === 'active'
    const isTrialing = sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()

    res.status(200).json({ isPremium: isActive || isTrialing, status: sub.status })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
