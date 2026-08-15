import { timingSafeEqual } from 'node:crypto'

function internalRequestIsValid(req) {
  const supplied = String(req.headers['x-reputeo-internal-secret'] || '')
  const expected = String(process.env.STRIPE_WEBHOOK_SECRET || '')
  if (!supplied || !expected || supplied.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  // Cette route ne doit jamais devenir une passerelle publique d'envoi d'e-mails.
  // Les notifications Stripe y accèdent avec un secret serveur, jamais depuis le navigateur.
  if (!internalRequestIsValid(req)) return res.status(401).json({ error: 'Requête interne non autorisée.' })

  const { type, to, data } = req.body
  if (!type || !to || !validEmail(to)) return res.status(400).json({ error: 'Destinataire ou type d’e-mail invalide.' })

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    let subject, html

    if (type === 'welcome') {
      subject = '🎉 Bienvenue sur Reputeo !'
      html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#080810;color:#f0f0ff;padding:40px;border-radius:16px">
          <div style="text-align:center;margin-bottom:32px">
            <h1 style="font-size:2rem;font-weight:800;letter-spacing:-0.04em;margin:0">Repute<span style="background:linear-gradient(135deg,#4f6ef7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent">o</span></h1>
          </div>
          <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:16px">Bienvenue ${escapeHtml(String(data?.name || '').slice(0, 80))} ! 👋</h2>
          <p style="color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:24px">
            Votre compte Reputeo est activé. Votre essai gratuit de 14 jours commence maintenant.
          </p>
          <div style="background:rgba(79,110,247,0.1);border:1px solid rgba(79,110,247,0.2);border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="margin:0;font-weight:600;margin-bottom:8px">Ce que vous pouvez faire maintenant :</p>
            <ul style="color:rgba(255,255,255,0.6);line-height:2;padding-left:20px;margin:0">
              <li>Connecter votre fiche Google Business</li>
              <li>Voir et analyser tous vos avis</li>
              <li>Recevoir votre rapport hebdomadaire chaque lundi</li>
            </ul>
          </div>
          <div style="text-align:center">
            <a href="https://reputeo.app/dashboard.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f6ef7,#7c3aed);color:#fff;text-decoration:none;border-radius:100px;font-weight:500">
              Accéder à mon dashboard →
            </a>
          </div>
          <p style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;margin-top:32px">
            Reputeo · Fait avec ☕ en France · <a href="#" style="color:rgba(79,110,247,0.6)">Se désabonner</a>
          </p>
        </div>`
    }

    if (type === 'payment_receipt') {
      const amount = escapeHtml(String(data?.amount || '29,99 €').slice(0, 40))
      const date = escapeHtml(String(data?.date || new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })).slice(0, 80))
      const invoiceUrl = String(data?.invoiceUrl || 'https://reputeo.app/dashboard.html')
      subject = `Reçu de paiement — Reputeo · ${amount}`
      html = `
        <div style="margin:0;padding:36px 16px;background:#f4f7f7;font-family:Arial,sans-serif;color:#172033">
          <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e6ebf1;border-radius:20px;overflow:hidden">
            <div style="padding:25px 30px;background:#143d3d;color:#fff;font-size:23px;font-weight:700;letter-spacing:-1px">Repute<span style="color:#8ed8c8">o</span></div>
            <div style="padding:34px 30px">
              <div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#e8f5f2;color:#0f766e;font-size:12px;font-weight:700">PAIEMENT CONFIRMÉ</div>
              <h1 style="margin:17px 0 10px;font-size:28px;letter-spacing:-1px">Merci, votre paiement est reçu.</h1>
              <p style="margin:0 0 24px;color:#667085;line-height:1.6">Votre abonnement Reputeo reste actif. Voici le récapitulatif de votre prélèvement.</p>
              <div style="padding:19px 20px;background:#f7f9fa;border:1px solid #e7ecee;border-radius:13px">
                <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px"><tr><td style="padding:0 0 10px;color:#667085">Date</td><td style="padding:0 0 10px;text-align:right;font-weight:700">${date}</td></tr><tr><td style="padding:10px 0;border-top:1px solid #e2e8ea;color:#667085">Reputeo Pro · Mensuel</td><td style="padding:10px 0;border-top:1px solid #e2e8ea;text-align:right;font-size:18px;font-weight:700">${amount}</td></tr></table>
              </div>
              <p style="margin:22px 0 0;color:#98a2b3;font-size:12px;line-height:1.55">La facture officielle et vos moyens de paiement restent disponibles dans votre portail Stripe.</p>
              <a href="${invoiceUrl}" style="display:inline-block;margin-top:20px;padding:13px 18px;border-radius:9px;background:#0f766e;color:#fff;text-decoration:none;font-size:14px;font-weight:700">Voir ma facture</a>
            </div>
          </div>
        </div>`
    }

    if (type === 'weekly_report') {
      const reviews = Array.isArray(data?.reviews) ? data.reviews.slice(0, 10) : []
      const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—'
      const positive = reviews.filter(r => r.rating >= 4).length
      const negative = reviews.filter(r => r.rating <= 2).length

      subject = `📊 Votre rapport Reputeo — Semaine du ${new Date().toLocaleDateString('fr-FR')}`
      html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#080810;color:#f0f0ff;padding:40px;border-radius:16px">
          <div style="text-align:center;margin-bottom:32px">
            <h1 style="font-size:2rem;font-weight:800;letter-spacing:-0.04em;margin:0">Repute<span style="background:linear-gradient(135deg,#4f6ef7,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent">o</span></h1>
            <p style="color:rgba(255,255,255,0.4);margin-top:8px">Rapport hebdomadaire</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:32px">
            <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;text-align:center">
              <div style="font-size:1.8rem;font-weight:800;letter-spacing:-0.04em">${avg}★</div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px;text-transform:uppercase;letter-spacing:0.08em">Note globale</div>
            </div>
            <div style="background:rgba(16,185,129,0.1);border-radius:12px;padding:16px;text-align:center">
              <div style="font-size:1.8rem;font-weight:800;letter-spacing:-0.04em;color:#34d399">${positive}</div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px;text-transform:uppercase;letter-spacing:0.08em">Positifs</div>
            </div>
            <div style="background:rgba(239,68,68,0.1);border-radius:12px;padding:16px;text-align:center">
              <div style="font-size:1.8rem;font-weight:800;letter-spacing:-0.04em;color:#f87171">${negative}</div>
              <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px;text-transform:uppercase;letter-spacing:0.08em">À traiter</div>
            </div>
          </div>
          ${reviews.slice(0, 3).map(r => `
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:14px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-weight:500;font-size:0.875rem">${escapeHtml(String(r.author || '').slice(0, 80))}</span>
                <span style="color:${r.rating >= 4 ? '#34d399' : r.rating <= 2 ? '#f87171' : 'rgba(255,255,255,0.4)'};font-size:0.75rem">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
              </div>
              <p style="color:rgba(255,255,255,0.5);font-size:0.82rem;margin:0;line-height:1.5">${escapeHtml(String(r.text || '').slice(0, 100))}</p>
            </div>`).join('')}
          <div style="text-align:center;margin-top:28px">
            <a href="https://reputeo.app/dashboard.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f6ef7,#7c3aed);color:#fff;text-decoration:none;border-radius:100px;font-weight:500">
              Voir tous mes avis →
            </a>
          </div>
          <p style="color:rgba(255,255,255,0.3);font-size:0.8rem;text-align:center;margin-top:32px">
            Reputeo · Rapport automatique chaque lundi · <a href="#" style="color:rgba(79,110,247,0.6)">Se désabonner</a>
          </p>
        </div>`
    }

    if (!subject) return res.status(400).json({ error: 'Unknown email type' })

    const result = await resend.emails.send({
      from: 'Reputeo <noreply@reputeo.app>',
      to,
      subject,
      html
    }, data?.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : undefined)

    res.status(200).json({ success: true, id: result.id })
  } catch (err) {
    console.error('Email error:', err)
    res.status(500).json({ error: 'Impossible d’envoyer cet e-mail pour le moment.' })
  }
}
