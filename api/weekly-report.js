import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data: subs } = await sb
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active')

    if (!subs || subs.length === 0) {
      return res.status(200).json({ sent: 0, message: 'Aucun abonné actif' })
    }

    let sent = 0

    for (const sub of subs) {
      const { data: { users } } = await sb.auth.admin.listUsers()
      const user = users?.find(u => u.id === sub.user_id)
      if (!user?.email) continue

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: reviews } = await sb
        .from('reviews')
        .select('*')
        .eq('user_id', sub.user_id)
        .gte('date', weekAgo)
        .order('date', { ascending: false })
        .limit(10)

      if (!reviews || reviews.length === 0) continue

      const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      const positive = reviews.filter(r => r.rating >= 4).length
      const negative = reviews.filter(r => r.rating <= 2).length

      await resend.emails.send({
        from: 'Reputeo <noreply@reputeo.app>',
        to: user.email,
        subject: `📊 Votre rapport Reputeo — Semaine du ${new Date().toLocaleDateString('fr-FR')}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#080810;color:#f0f0ff;padding:40px;border-radius:16px">
            <h1 style="font-size:2rem;font-weight:800;letter-spacing:-0.04em;margin-bottom:8px">Reputeo</h1>
            <p style="color:rgba(255,255,255,0.4);margin-bottom:32px">Rapport hebdomadaire</p>
            <div style="display:flex;gap:12px;margin-bottom:32px">
              <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:1.8rem;font-weight:800">${avg}★</div>
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px">Note globale</div>
              </div>
              <div style="flex:1;background:rgba(16,185,129,0.1);border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:1.8rem;font-weight:800;color:#34d399">${positive}</div>
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px">Positifs</div>
              </div>
              <div style="flex:1;background:rgba(239,68,68,0.1);border-radius:12px;padding:16px;text-align:center">
                <div style="font-size:1.8rem;font-weight:800;color:#f87171">${negative}</div>
                <div style="font-size:0.72rem;color:rgba(255,255,255,0.4);margin-top:4px">À traiter</div>
              </div>
            </div>
            ${reviews.slice(0, 3).map(r => `
              <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:14px;margin-bottom:10px">
                <div style="font-weight:500;font-size:0.875rem;margin-bottom:4px">${r.author}</div>
                <div style="color:rgba(255,255,255,0.5);font-size:0.82rem">${(r.text||'').substring(0,100)}</div>
              </div>`).join('')}
            <div style="text-align:center;margin-top:28px">
              <a href="https://reputeo.app/dashboard.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f6ef7,#7c3aed);color:#fff;text-decoration:none;border-radius:100px;font-weight:500">Voir tous mes avis →</a>
            </div>
          </div>`
      })

      sent++
    }

    res.status(200).json({ sent, total: subs.length })
  } catch (err) {
    console.error('Cron error:', err)
    res.status(500).json({ error: err.message })
  }
}
