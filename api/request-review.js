import { Resend } from 'resend'
import { requireUser } from '../lib/session.js'
import { requirePremiumAccess } from '../lib/access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res)
  if (!user) return
  if (!await requirePremiumAccess(user, res)) return

  const { client_firstname, client_email, google_link, business_name } = req.body
  if (!client_email || !google_link) return res.status(400).json({ error: 'Champs manquants' })
  if (!validEmail(client_email) || !isHttpUrl(google_link)) return res.status(400).json({ error: 'Adresse e-mail ou lien Google invalide.' })

  const firstname = escapeHtml(String(client_firstname || '').trim().slice(0, 80))
  const business = escapeHtml(String(business_name || '').trim().slice(0, 120)) || 'Notre équipe'
  const reviewLink = escapeAttribute(google_link)

  const resend = new Resend(process.env.RESEND_API_KEY)

  const { error } = await resend.emails.send({
    from: 'Reputeo <noreply@reputeo.app>',
    to: client_email,
    subject: `${firstname ? firstname + ', votre' : 'Votre'} avis compte beaucoup pour nous`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;padding:40px;border-radius:16px">
        <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:12px;color:#1a1a2e">
          ${firstname ? `Bonjour ${firstname},` : 'Bonjour,'}
        </h2>
        <p style="color:#555;line-height:1.7;margin-bottom:24px">
          Merci de nous avoir fait confiance. Votre expérience compte énormément pour nous et pour les futurs clients qui cherchent un service de qualité.
        </p>
        <p style="color:#555;line-height:1.7;margin-bottom:32px">
          Pourriez-vous prendre 30 secondes pour laisser un avis sur Google ? Cela nous aide vraiment à nous améliorer et à faire connaître notre établissement.
        </p>
        <div style="text-align:center;margin-bottom:32px">
          <a href="${reviewLink}" style="display:inline-block;padding:16px 36px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:1rem">
            ⭐ Laisser un avis Google
          </a>
        </div>
        <p style="color:#999;font-size:0.8rem;text-align:center">
          Merci de votre confiance !<br>
          ${business}
        </p>
      </div>
    `
  })

  if (error) {
    console.error('Review request email error:', error)
    return res.status(502).json({ error: 'Impossible d’envoyer la demande d’avis pour le moment.' })
  }
  res.json({ success: true })
}

function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')) }
function isHttpUrl(value) { try { return new URL(value).protocol === 'https:' } catch { return false } }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
function escapeAttribute(value) { return escapeHtml(value) }
