import { requireUser } from '../lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const user = await requireUser(req, res)
  if (!user) return
  const userId = user.id
  const isAccountDeletion = req.query?.action === 'delete-account'

  if (isAccountDeletion && String(req.body?.confirmation || '') !== 'SUPPRIMER') {
    return res.status(400).json({ error: 'Confirmation invalide.' })
  }

  try {
    const stripe = (await import('stripe')).default
    const stripeClient = stripe(process.env.STRIPE_SECRET_KEY)
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Get stripe customer id
    const { data: sub, error: subscriptionError } = await sb
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (subscriptionError) throw subscriptionError

    if (isAccountDeletion) {
      // Stop every active trial or paid subscription before deleting local
      // data. A deleted Reputeo account must never continue to be billed.
      if (sub?.stripe_customer_id) {
        const subscriptions = await stripeClient.subscriptions.list({
          customer: sub.stripe_customer_id,
          status: 'all',
          limit: 100
        })
        for (const subscription of subscriptions.data) {
          if (['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status)) {
            await stripeClient.subscriptions.cancel(subscription.id)
          }
        }
      }

      for (const table of ['google_connections', 'reviews', 'subscriptions']) {
        const { error } = await sb.from(table).delete().eq('user_id', userId)
        if (error) throw error
      }
      const { error: deleteUserError } = await sb.auth.admin.deleteUser(userId)
      if (deleteUserError) throw deleteUserError
      return res.status(200).json({ success: true })
    }

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
    res.status(500).json({ error: 'Impossible d’ouvrir la gestion de votre abonnement pour le moment.' })
  }
}
