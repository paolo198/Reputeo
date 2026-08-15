import { requireUser } from '../lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await requireUser(req, res)
  if (!user) return
  const userId = user.id
  const email = user.email

  try {
    const stripe = (await import('stripe')).default
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY)
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Never create a second Checkout session when the customer already has an
    // active subscription or trial. This protects against double-clicks and
    // retrying after returning from Stripe.
    const existingRecord = await sb
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (existingRecord.data?.stripe_customer_id) {
      const existingSubscriptions = await stripeClient.subscriptions.list({
        customer: existingRecord.data.stripe_customer_id,
        status: 'all',
        limit: 20
      })
      const currentSubscription = existingSubscriptions.data.find(item =>
        ['active', 'trialing', 'past_due', 'unpaid'].includes(item.status)
      )
      if (currentSubscription) {
        return res.status(409).json({
          error: 'Un essai ou un abonnement Reputeo est déjà actif pour ce compte.'
        })
      }
    }

    // Create or get Stripe customer
    const customers = await stripeClient.customers.list({ email, limit: 1 })
    let customer
    if (customers.data.length > 0) {
      customer = customers.data[0]
    } else {
      // Stripe returns the same customer if two browser tabs start this flow
      // at the same time for the same Reputeo account.
      customer = await stripeClient.customers.create(
        { email, metadata: { user_id: userId } },
        { idempotencyKey: `reputeo-customer-${userId}` }
      )
    }

    // Save customer ID in subscriptions table
    const saveCustomer = await sb.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: customer.id,
      status: 'inactive'
    }, { onConflict: 'user_id' })
    if (saveCustomer.error) throw saveCustomer.error

    // Reuse an already-open Checkout page. It is both clearer for the user and
    // prevents a second subscription when the checkout button is clicked again.
    const openSessions = await stripeClient.checkout.sessions.list({
      customer: customer.id,
      status: 'open',
      limit: 1
    })
    if (openSessions.data[0]?.url) {
      return res.status(200).json({ url: openSessions.data[0].url, reused: true })
    }

    // Create checkout session with trial
    const checkoutWindow = Math.floor(Date.now() / (5 * 60 * 1000))
    const session = await stripeClient.checkout.sessions.create(
      {
        customer: customer.id,
        client_reference_id: userId,
        payment_method_types: ['card'],
        mode: 'subscription',
        metadata: { user_id: userId },
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
          trial_period_days: 14,
          metadata: { user_id: userId }
        },
        allow_promotion_codes: true,
        success_url: `https://www.reputeo.app/dashboard.html?paid=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://www.reputeo.app/dashboard.html?cancelled=true`
      },
      { idempotencyKey: `reputeo-checkout-${userId}-${checkoutWindow}` }
    )

    res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    res.status(500).json({ error: 'Impossible de préparer le paiement pour le moment. Réessayez dans quelques instants.' })
  }
}
