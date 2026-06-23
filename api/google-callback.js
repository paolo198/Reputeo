export default async function handler(req, res) {
  const { code, state: userId, error } = req.query
  
  if (error) {
    return res.redirect('/dashboard.html?error=google_denied')
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const REDIRECT_URI = 'https://avisio-4b.vercel.app/api/google-callback'

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    })
    
    const tokens = await tokenRes.json()
    if (tokens.error) throw new Error(tokens.error_description)

    // Store tokens in Supabase
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    
    await sb.from('google_connections').upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    res.redirect('/dashboard.html?connected=google')
  } catch (e) {
    console.error(e)
    res.redirect('/dashboard.html?error=google_failed')
  }
}
