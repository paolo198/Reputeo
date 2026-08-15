import { requireUser } from '../lib/session.js'
import { hasPremiumAccess, isFounder } from '../lib/access.js'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()
  const user = await requireUser(req, res)
  if (!user) return
  try {
    if (req.query.action === 'send-demo-report') return sendDemoReport(req, user, res)
    if (req.query.action === 'report-status') return reportStatus(user, res)
    if (isFounder(user)) return res.status(200).json({ isPremium: true, isFounder: true, status: 'founder', trialEndsAt: null })

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    let { data: subscription } = await sb
      .from('subscriptions')
      .select('status, trial_ends_at, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    // After Stripe Checkout, confirm the subscription directly. This is a backup
    // to the webhook so access is not delayed if the webhook arrives late.
    if (req.method === 'POST' && subscription?.stripe_customer_id) {
      const Stripe = (await import('stripe')).default
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY)
      const stripeSubscriptions = await stripe.subscriptions.list({ customer: subscription.stripe_customer_id, status: 'all', limit: 20 })
      const activeStripeSubscription = stripeSubscriptions.data.find(item => ['active', 'trialing'].includes(item.status))
      if (activeStripeSubscription) {
        const trialEndsAt = activeStripeSubscription.trial_end ? new Date(activeStripeSubscription.trial_end * 1000).toISOString() : null
        await sb.from('subscriptions').update({
          stripe_subscription_id: activeStripeSubscription.id,
          status: 'active',
          trial_ends_at: trialEndsAt
        }).eq('user_id', user.id)
        subscription = { ...subscription, status: 'active', trial_ends_at: trialEndsAt }
      }
    }

    const isPremium = subscription?.status === 'active' || Boolean(subscription?.trial_ends_at && new Date(subscription.trial_ends_at) > new Date())

    res.status(200).json({
      isPremium,
      isFounder: false,
      status: subscription?.status || 'inactive',
      trialEndsAt: subscription?.trial_ends_at || null,
      hasBillingProfile: Boolean(subscription?.stripe_customer_id)
    })
  } catch (err) {
    console.error('Subscription check error:', err)
    res.status(500).json({ error: 'Impossible de vérifier votre accès pour le moment.' })
  }
}

async function reportStatus(user, res) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { data, error } = await sb.auth.admin.getUserById(user.id)
  if (error) return res.status(500).json({ error: 'Impossible de lire la date du rapport.' })
  res.status(200).json({ lastReportAt: data.user?.user_metadata?.last_weekly_report_at || null })
}

const demoReviews = [
  { author: 'Marie L.', rating: 5, text: 'Intervention très soignée et équipe ponctuelle. Je recommande sans hésiter.' },
  { author: 'Julien P.', rating: 4, text: 'Très bon service. La prise de rendez-vous pourrait être un peu plus simple.' },
  { author: 'Sophie R.', rating: 5, text: 'Équipe agréable, travail impeccable et explications très claires.' },
  { author: 'Thomas B.', rating: 3, text: 'Prestation correcte, mais le délai annoncé a légèrement dépassé.' },
  { author: 'Camille D.', rating: 5, text: 'Rapide, professionnel et très bon suivi après l’intervention.' }
]

async function sendDemoReport(req, user, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!isFounder(user)) return res.status(403).json({ error: 'Cet aperçu est réservé au compte fondateur.' })
  try {
    const average = (demoReviews.reduce((total, review) => total + review.rating, 0) / demoReviews.length).toFixed(1)
    const positive = demoReviews.filter(review => review.rating >= 4).length
    const toReply = demoReviews.filter(review => review.rating <= 3).length
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const result = await resend.emails.send({
      from: 'Reputeo <noreply@reputeo.app>',
      to: user.email,
      subject: `Aperçu — Votre rapport Reputeo du ${date}`,
      html: demoReportHtml({ average, positive, toReply, date })
    })
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    await sb.auth.admin.updateUserById(user.id, { user_metadata: { ...(user.user_metadata || {}), last_weekly_report_at: new Date().toISOString() } })
    res.status(200).json({ success: true, id: result.id })
  } catch (error) {
    console.error('Demo report email failed:', error)
    res.status(500).json({ error: 'Impossible d’envoyer l’aperçu pour le moment.' })
  }
}

function demoReportHtml({ average, positive, toReply, date }) {
  const reviewRows = demoReviews.slice(0, 3).map(review => `<tr><td style="padding:17px 0;border-top:1px solid #e6ebf1"><div style="font-size:14px;font-weight:700;color:#172033">${review.author}</div><div style="padding-top:4px;font-size:13px;line-height:1.5;color:#667085">${review.text}</div></td><td style="padding:17px 0 17px 14px;border-top:1px solid #e6ebf1;text-align:right;vertical-align:top;font-size:13px;color:#a66b18;white-space:nowrap">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</td></tr>`).join('')
  return `<div style="margin:0;padding:36px 16px;background:#f4f7f7;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e3e9ea;border-radius:20px;overflow:hidden"><div style="padding:25px 30px;background:#143d3d;color:#fff"><div style="font-size:22px;font-weight:700;letter-spacing:-1px">Repute<span style="color:#8ed8c8">o</span></div><div style="margin-top:7px;font-size:12px;color:#b7d2cd;letter-spacing:.08em;text-transform:uppercase">Rapport hebdomadaire</div></div><div style="padding:28px 30px"><div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#fff4d8;color:#9a6713;font-size:11px;font-weight:700;letter-spacing:.04em">APERÇU — DONNÉES DE DÉMONSTRATION</div><h1 style="margin:18px 0 8px;font-size:28px;line-height:1.08;letter-spacing:-1.2px">Votre semaine, en clair.</h1><p style="margin:0 0 23px;color:#667085;font-size:14px;line-height:1.55">Voici ce que vos clients ont partagé cette semaine. Rapport généré le ${date}.</p><table role="presentation" width="100%" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px 24px"><tr><td style="width:33%;padding:15px 10px;background:#f2f8f7;border-radius:12px;text-align:center"><div style="font-size:23px;font-weight:700;color:#0f766e">${average}</div><div style="margin-top:4px;font-size:10px;font-weight:700;color:#667085;letter-spacing:.07em;text-transform:uppercase">Note moyenne</div></td><td style="width:33%;padding:15px 10px;background:#f2f8f7;border-radius:12px;text-align:center"><div style="font-size:23px;font-weight:700;color:#0f766e">${positive}</div><div style="margin-top:4px;font-size:10px;font-weight:700;color:#667085;letter-spacing:.07em;text-transform:uppercase">Avis positifs</div></td><td style="width:33%;padding:15px 10px;background:#fff7e9;border-radius:12px;text-align:center"><div style="font-size:23px;font-weight:700;color:#a66b18">${toReply}</div><div style="margin-top:4px;font-size:10px;font-weight:700;color:#667085;letter-spacing:.07em;text-transform:uppercase">À suivre</div></td></tr></table><div style="padding:17px 18px;background:#f7f9fa;border-left:3px solid #0f766e;border-radius:8px;margin-bottom:25px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0f766e">À retenir</div><div style="margin-top:6px;font-size:14px;line-height:1.55;color:#344054">La ponctualité et la qualité de l’intervention ressortent comme vos principaux points forts. Un avis signale un délai à mieux cadrer.</div></div><h2 style="margin:0 0 8px;font-size:16px;letter-spacing:-.3px">Les avis à connaître</h2><table role="presentation" width="100%" style="border-collapse:collapse">${reviewRows}</table><div style="padding-top:24px;text-align:center"><a href="https://reputeo.app/dashboard.html" style="display:inline-block;padding:13px 18px;border-radius:9px;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Ouvrir Reputeo</a></div></div><div style="padding:17px 30px;border-top:1px solid #edf0f2;color:#98a2b3;font-size:11px;line-height:1.5">Ceci est un aperçu de démonstration réservé au compte fondateur Reputeo. Aucun avis réel n’a été utilisé.</div></div></div>`
}
