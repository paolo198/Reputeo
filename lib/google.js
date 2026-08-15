import { createClient } from '@supabase/supabase-js'

const accountCache = new Map()

export async function getGoogleConnection(userId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { data, error } = await supabase
    .from('google_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error('Impossible de retrouver votre connexion Google enregistrée.')
  return data || null
}

export async function getGoogleAccessToken(userId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const connection = await getGoogleConnection(userId)
  if (!connection) return null
  let accessToken = connection.access_token
  if (new Date(connection.expires_at) < new Date()) {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: connection.refresh_token, grant_type: 'refresh_token' }) })
    const refreshed = await response.json()
    if (!response.ok || !refreshed.access_token) throw new Error('La connexion Google a expiré. Reconnectez votre compte.')
    accessToken = refreshed.access_token
    await supabase.from('google_connections').update({ access_token: accessToken, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() }).eq('user_id', userId)
  }
  return accessToken
}

export async function getGoogleAccount(accessToken) {
  const cached = accountCache.get(accessToken)
  if (cached && cached.expiresAt > Date.now()) return cached.account
  const response = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await response.json()
  if (response.status === 429) {
    const error = new Error('Google Business n’a pas encore accordé l’accès API à Reputeo. La connexion est bien enregistrée, mais Google doit valider l’accès aux fiches et aux avis avant la synchronisation.')
    error.status = response.status
    error.code = data.error?.status || 'RESOURCE_EXHAUSTED'
    throw error
  }
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Google Business n’a pas pu répondre.')
    error.status = response.status
    error.code = data.error?.status || 'GOOGLE_BUSINESS_ERROR'
    throw error
  }
  // A Google account may have approved Reputeo without owning a Business
  // Profile yet. That is a valid connection, not an authentication failure.
  const account = data.accounts?.[0] || null
  accountCache.set(accessToken, { account, expiresAt: Date.now() + 60_000 })
  return account
}

export async function googleJson(url, options = {}) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error?.message || 'Google n’a pas pu traiter cette demande.')
    error.status = response.status
    error.code = data.error?.status || 'GOOGLE_BUSINESS_ERROR'
    throw error
  }
  return data
}
