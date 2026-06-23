export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  const REDIRECT_URI = 'https://avisio-4b.vercel.app/api/google-callback'

  if (req.method === 'GET' && req.query.action === 'auth-url') {
    const scopes = [
      'https://www.googleapis.com/auth/business.manage'
    ].join(' ')
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${req.query.user_id || ''}`
    
    return res.status(200).json({ url })
  }

  res.status(400).json({ error: 'Invalid request' })
}
