import { Resend } from 'resend'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { client_firstname, client_email, google_link, business_name } = req.body
  if (!client_email || !google_link) return res.status(400).json({ error: 'Champs manquants' })

  const resend = new Resend(process.env.RESEND_API_KEY)

  const { error } = await resend.emails.send({
    from: 'Reputeo <onboarding@resend.dev>',
    to: client_email,
    subject: `${client_firstname ? client_firstname + ', votre' : 'Votre'} avis compte beaucoup pour nous ⭐`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;padding:40px;border-radius:16px">
        <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:12px;color:#1a1a2e">
          ${client_firstname ? `Bonjour ${client_firstname},` : 'Bonjour,'}
        </h2>
        <p style="color:#555;line-height:1.7;margin-bottom:24px">
          Merci de nous avoir fait confiance. Votre expérience compte énormément pour nous et pour les futurs clients qui cherchent un service de qualité.
        </p>
        <p style="color:#555;line-height:1.7;margin-bottom:32px">
          Pourriez-vous prendre 30 secondes pour laisser un avis sur Google ? Cela nous aide vraiment à nous améliorer et à faire connaître notre établissement.
        </p>
        <div style="text-align:center;margin-bottom:32px">
          <a href="${google_link}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#4f6ef7,#7c3aed);color:#fff;text-decoration:none;border-radius:100px;font-weight:600;font-size:1rem">
            ⭐ Laisser un avis Google
          </a>
        </div>
        <p style="color:#999;font-size:0.8rem;text-align:center">
          Merci de votre confiance !<br>
          ${business_name || 'Notre équipe'}
        </p>
      </div>
    `
  })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
}
