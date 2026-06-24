export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { user_id } = req.body
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' })

  try {
    const stripe = (await import('stripe')).default
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY)
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Get stripe customer id
    const { data: sub } = await sb
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user_id)
      .single()

    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement trouvé' })
    }

    // Create portal session
    const session = await stripeClient.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: 'https://reputeo.app/dashboard.html'
    })

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Portal error:', err)
    res.status(500).json({ error: err.message })
  }
}
