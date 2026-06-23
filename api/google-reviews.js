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
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Get stored tokens
    const { data: conn, error: connErr } = await sb
      .from('google_connections')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (connErr || !conn) {
      return res.status(200).json({ connected: false, reviews: [] })
    }

    // Refresh token if expired
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

    // Get accounts
    const accountsRes = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const accountsData = await accountsRes.json()
    
    if (!accountsData.accounts || accountsData.accounts.length === 0) {
      return res.status(200).json({ connected: true, reviews: [], message: 'Aucun établissement Google Business trouvé' })
    }

    const accountName = accountsData.accounts[0].name

    // Get locations
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const locData = await locRes.json()
    
    if (!locData.locations || locData.locations.length === 0) {
      return res.status(200).json({ connected: true, reviews: [], message: 'Aucun établissement trouvé' })
    }

    // Get reviews for first location
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

    // Save reviews to Supabase
    if (reviews.length > 0) {
      await sb.from('reviews').upsert(
        reviews.map(r => ({ ...r, user_id: userId })),
        { onConflict: 'id' }
      )
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
