export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { user_id, review_id, reply_text } = req.body
  if (!user_id || !review_id || !reply_text) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

    // Get stored tokens
    const { data: conn } = await sb
      .from('google_connections')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (!conn) return res.status(400).json({ error: 'Google non connecté' })

    let accessToken = conn.access_token

    // Refresh if expired
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
        }).eq('user_id', user_id)
      }
    }

    // Post reply to Google
    const replyRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${review_id}/reply`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ comment: reply_text })
      }
    )

    if (!replyRes.ok) {
      const err = await replyRes.json()
      throw new Error(err.error?.message || 'Erreur Google API')
    }

    // Update reply in Supabase
    await sb.from('reviews').update({ reply: reply_text }).eq('id', review_id)

    res.status(200).json({ success: true })
  } catch (err) {
    console.error('Reply error:', err)
    res.status(500).json({ error: err.message })
  }
}
