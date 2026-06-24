export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    const stripe = (await import('stripe')).default
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY)
    event = stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).json({ error: err.message })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  try {
    const sub = event.data.object

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const isActive = ['active', 'trialing'].includes(sub.status)
      const customerId = sub.customer

      // Find user by stripe customer id or email
      const { data: existing } = await sb
        .from('subscriptions')
        .select('user_id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (existing) {
        await sb.from('subscriptions').update({
          stripe_subscription_id: sub.id,
          status: isActive ? 'active' : 'inactive',
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null
        }).eq('stripe_customer_id', customerId)

        // Send welcome email on first activation
        if (event.type === 'customer.subscription.created' && isActive) {
          const stripeClient2 = (await import('stripe')).default(process.env.STRIPE_SECRET_KEY)
          const customer = await stripeClient2.customers.retrieve(customerId)
          if (customer.email) {
            await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://reputeo.app'}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'welcome',
                to: customer.email,
                data: { name: customer.email.split('@')[0] }
              })
            })
          }
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      await sb.from('subscriptions').update({
        status: 'inactive'
      }).eq('stripe_customer_id', sub.customer)
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    res.status(500).json({ error: err.message })
  }
}
