export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { type, to, data } = req.body
  if (!type || !to) return res.status(400).json({ error: 'Missing type or to' })

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
          <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:16px">Bienvenue ${data?.name || ''} ! 👋</h2>
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

    if (type === 'weekly_report') {
      const reviews = data?.reviews || []
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
                <span style="font-weight:500;font-size:0.875rem">${r.author}</span>
                <span style="color:${r.rating >= 4 ? '#34d399' : r.rating <= 2 ? '#f87171' : 'rgba(255,255,255,0.4)'};font-size:0.75rem">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
              </div>
              <p style="color:rgba(255,255,255,0.5);font-size:0.82rem;margin:0;line-height:1.5">${(r.text||'').substring(0,100)}</p>
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
      from: 'Reputeo <onboarding@resend.dev>',
      to,
      subject,
      html
    })

    res.status(200).json({ success: true, id: result.id })
  } catch (err) {
    console.error('Email error:', err)
    res.status(500).json({ error: err.message })
  }
}
