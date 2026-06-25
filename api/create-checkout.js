export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { user_id, email } = req.body
  if (!user_id || !email) return res.status(400).json({ error: 'Missing user_id or email' })

  try {
    const stripe = (await import('stripe')).default
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY)
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Create or get Stripe customer
    const customers = await stripeClient.customers.list({ email, limit: 1 })
    let customer
    if (customers.data.length > 0) {
      customer = customers.data[0]
    } else {
      customer = await stripeClient.customers.create({ email, metadata: { user_id } })
    }

    // Save customer ID in subscriptions table
    await sb.from('subscriptions').upsert({
      user_id,
      stripe_customer_id: customer.id,
      status: 'inactive'
    }, { onConflict: 'user_id' })

    // Create checkout session with trial
    const session = await stripeClient.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: 'Reputeo — Abonnement mensuel' },
          unit_amount: 2999,
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      subscription_data: {
        trial_period_days: 14
      },
      success_url: `https://reputeo.app/dashboard.html?paid=true`,
      cancel_url: `https://reputeo.app/dashboard.html?cancelled=true`
    })

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    res.status(500).json({ error: err.message })
  }
}
