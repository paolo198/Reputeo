export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' })
  
  const userId = req.query.user_id
  if (!userId) return res.status(400).json({ error: 'user_id requis' })

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const { Resend } = await import('resend')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data: conn, error: connErr } = await sb
      .from('google_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connErr || !conn) {
      return res.status(200).json({ connected: false, reviews: [] })
    }

    let accessToken = conn.access_token
    if (new Date(conn.expires_at) < new Date()) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: conn.refresh_token,
          grant_type: 'refresh_token'
        })
      })
      const refreshed = await refreshRes.json()
      if (!refreshed.error) {
        accessToken = refreshed.access_token
        await sb.from('google_connections').update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        }).eq('user_id', userId)
      }
    }

    const accountsRes = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const accountsData = await accountsRes.json()
    
    if (!accountsData.accounts || accountsData.accounts.length === 0) {
      return res.status(200).json({ connected: true, reviews: [], message: 'Aucun établissement Google Business trouvé' })
    }

    const accountName = accountsData.accounts[0].name

    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const locData = await locRes.json()
    
    if (!locData.locations || locData.locations.length === 0) {
      return res.status(200).json({ connected: true, reviews: [], message: 'Aucun établissement trouvé' })
    }

    const locationName = locData.locations[0].name
    const reviewsRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const reviewsData = await reviewsRes.json()

    const reviews = (reviewsData.reviews || []).map(r => ({
      id: r.reviewId,
      author: r.reviewer?.displayName || 'Anonyme',
      rating: { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[r.starRating] || 0,
      text: r.comment || '',
      date: r.createTime,
      platform: 'google',
      reply: r.reviewReply?.comment || null
    }))

    if (reviews.length > 0) {
      // Récupérer les IDs déjà en base
      const { data: existing } = await sb
        .from('reviews')
        .select('id')
        .eq('user_id', userId)

      const existingIds = new Set((existing || []).map(r => r.id))
      const newReviews = reviews.filter(r => !existingIds.has(r.id))

      await sb.from('reviews').upsert(
        reviews.map(r => ({ ...r, user_id: userId })),
        { onConflict: 'id' }
      )

      // Envoyer alertes pour les nouveaux avis
      if (newReviews.length > 0) {
        const { data: { users } } = await sb.auth.admin.listUsers()
        const user = users?.find(u => u.id === userId)
        if (user?.email) {
          for (const r of newReviews) {
            const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)
            const sentiment = r.rating >= 4 ? '🟢 Positif' : r.rating <= 2 ? '🔴 Négatif' : '🟡 Neutre'
            await resend.emails.send({
              from: 'Reputeo <noreply@reputeo.app>',
              to: user.email,
              subject: `${r.rating >= 4 ? '🌟' : '⚠️'} Nouvel avis de ${r.author} — ${stars}`,
              html: `
                <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#080810;color:#f0f0ff;padding:40px;border-radius:16px">
                  <h1 style="font-size:1.8rem;font-weight:800;margin-bottom:4px">Reputeo</h1>
                  <p style="color:rgba(255,255,255,0.4);margin-bottom:32px">Nouvel avis reçu</p>
                  <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:24px;margin-bottom:24px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                      <div style="font-weight:600">${r.author}</div>
                      <div style="font-size:0.75rem;padding:4px 10px;background:rgba(255,255,255,0.08);border-radius:100px">${sentiment}</div>
                    </div>
                    <div style="font-size:1.2rem;margin-bottom:8px">${stars}</div>
                    <div style="color:rgba(255,255,255,0.6);font-size:0.875rem">${r.text || 'Aucun commentaire'}</div>
                  </div>
                  <div style="text-align:center">
                    <a href="https://reputeo.app/dashboard.html" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f6ef7,#7c3aed);color:#fff;text-decoration:none;border-radius:100px;font-weight:500">Répondre à cet avis →</a>
                  </div>
                </div>`
            })
          }
        }
      }
    }

    res.status(200).json({
      connected: true,
      business_name: locData.locations[0].title,
      reviews,
      total: reviews.length
    })

  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
