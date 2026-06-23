export default async function handler(req, res) {
  // Sécurité : vérifier le secret cron
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Get all active subscribers
    const { data: subs } = await sb
      .from('subscriptions')
      .select('user_id, stripe_customer_id')
      .eq('status', 'active')

    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0 })
    }

    let sent = 0

    for (const sub of subs) {
      // Get user email
      const { data: { users } } = await sb.auth.admin.listUsers()
      const user = users?.find(u => u.id === sub.user_id)
      if (!user?.email) continue

      // Get user reviews from last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: reviews } = await sb
        .from('reviews')
        .select('*')
        .eq('user_id', sub.user_id)
        .gte('date', weekAgo)
        .order('date', { ascending: false })
        .limit(10)

      if (!reviews || reviews.length === 0) continue

      // Send weekly report
      await fetch('https://avisio-4b.vercel.app/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'weekly_report',
          to: user.email,
          data: { reviews }
        })
      })

      sent++
    }

    res.status(200).json({ sent, total: subs.length })
  } catch (err) {
    console.error('Cron error:', err)
    res.status(500).json({ error: err.message })
  }
}
