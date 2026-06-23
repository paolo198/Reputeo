export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  res.status(200).json({
    supabase_url: process.env.SUPABASE_URL,
    supabase_anon: process.env.SUPABASE_ANON_KEY
  })
}
