import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '../lib/session.js'
import { requirePremiumAccess } from '../lib/access.js'
import { getGoogleAccessToken, getGoogleAccount, getGoogleConnection, googleJson } from '../lib/google.js'

export default async function handler(req, res) {
  const action = req.query.action
  if (action === 'callback') return callback(req, res)
  const user = await requireUser(req, res)
  if (!user) return
  // A user must always be able to see or remove a connection already saved.
  // These checks must not disappear when an account is between two plans.
  if (action === 'disconnect') return disconnect(req, res)
  if (action === 'profile-status') return profileStatus(req, res)
  if (!await requirePremiumAccess(user, res)) return
  if (action === 'auth-url') return authUrl(req, res)
  if (action === 'reviews') return reviews(req, res)
  if (action === 'categories') return categories(req, res)
  if (action === 'location') return location(req, res)
  if (action === 'reply') return reply(req, res)
  return res.status(400).json({ error: 'Action Google invalide' })
}

async function authUrl(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  const state = signedState(user.id, process.env.GOOGLE_CLIENT_SECRET)
  const scope = 'https://www.googleapis.com/auth/business.manage'
  const parameters = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: 'https://reputeo.app/api/google?action=callback', response_type: 'code', scope, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })
  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${parameters}` })
}

async function callback(req, res) {
  if (req.query.error) return res.redirect('/dashboard.html?error=google_denied')
  try {
    const state = verifiedState(req.query.state, process.env.GOOGLE_CLIENT_SECRET)
    if (!state) throw new Error('État OAuth invalide ou expiré')
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: 'https://reputeo.app/api/google?action=callback', grant_type: 'authorization_code' }) })
    const tokens = await tokenResponse.json()
    if (!tokenResponse.ok || tokens.error) throw new Error(tokens.error_description || 'Connexion Google impossible')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data: existing, error: existingError } = await supabase.from('google_connections').select('user_id,refresh_token').eq('user_id', state.userId).maybeSingle()
    if (existingError) throw new Error('Impossible de vérifier la connexion Google existante.')
    const connection = { access_token: tokens.access_token, refresh_token: tokens.refresh_token || existing?.refresh_token || null, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), connected_at: new Date().toISOString() }
    const { error: saveError } = existing
      ? await supabase.from('google_connections').update(connection).eq('user_id', state.userId)
      : await supabase.from('google_connections').insert({ user_id: state.userId, ...connection })
    if (saveError) throw new Error('Impossible d’enregistrer la connexion Google. Réessayez.')
    res.redirect('/dashboard.html?connected=google')
  } catch (error) { console.error(error); res.redirect('/dashboard.html?error=google_failed') }
}

async function disconnect(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  const { error } = await supabase.from('google_connections').delete().eq('user_id', user.id)
  if (error) return res.status(500).json({ error: 'Impossible de déconnecter Google.' })
  res.status(200).json({ success: true })
}

async function reviews(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  try {
    const accessToken = await getGoogleAccessToken(user.id)
    if (!accessToken) return res.status(200).json({ connected: false, reviews: [] })
    const account = await getGoogleAccount(accessToken)
    if (!account) return res.status(200).json({ connected: true, hasBusinessAccount: false, reviews: [], message: 'Votre compte Google est connecté, mais aucune fiche Google Business n’est encore associée à ce compte.' })
    const locations = await googleJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!locations.locations?.length) return res.status(200).json({ connected: true, reviews: [], message: 'Aucun établissement Google Business trouvé' })
    const location = locations.locations[0]
    const reviewData = await googleJson(`https://mybusiness.googleapis.com/v4/${location.name}/reviews?pageSize=20`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const reviews = (reviewData.reviews || []).map(review => ({
      id: review.reviewId,
      resource_name: review.name,
      author: review.reviewer?.displayName || 'Anonyme',
      rating: ({ ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 })[review.starRating] || 0,
      text: review.comment || '',
      date: review.createTime,
      platform: 'google',
      reply: review.reviewReply?.comment || null
    }))
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    if (reviews.length) await supabase.from('reviews').upsert(reviews.map(({ resource_name, ...review }) => ({ ...review, user_id: user.id })), { onConflict: 'id' })
    res.status(200).json({ connected: true, business_name: location.title, reviews, total: reviews.length })
  } catch (error) { res.status(error.status || 500).json({ error: googleBusinessMessage(error), code: error.code || 'GOOGLE_BUSINESS_ERROR' }) }
}

async function profileStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  try {
    // The saved connection is the source of truth. A temporary Google quota or
    // API issue must never make the dashboard forget that it is connected.
    const savedConnection = await getGoogleConnection(user.id)
    if (!savedConnection) return res.status(200).json({ connected: false, locations: [] })
    const accessToken = await getGoogleAccessToken(user.id)
    if (!accessToken) return res.status(200).json({ connected: true, available: false, locations: [], message: 'Votre connexion Google est enregistrée. La synchronisation sera vérifiée au prochain chargement.' })
    const account = await getGoogleAccount(accessToken)
    if (!account) return res.status(200).json({ connected: true, hasBusinessAccount: false, locations: [], message: 'Votre compte Google est connecté, mais aucune fiche Google Business n’est encore associée à ce compte.' })
    const data = await googleJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,metadata`, { headers: { Authorization: `Bearer ${accessToken}` } })
    res.status(200).json({ connected: true, account: account.name, locations: data.locations || [] })
  } catch (error) {
    // Preserve the saved connection in the interface while Google is unavailable.
    console.error('Google Business profile-status sync failed:', error)
    res.status(200).json({ connected: true, available: false, locations: [], message: googleBusinessMessage(error), code: error.code || 'GOOGLE_BUSINESS_ERROR' })
  }
}

async function categories(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  try {
    const accessToken = await getGoogleAccessToken(user.id)
    if (!accessToken) return res.status(400).json({ error: 'Connectez Google avant de choisir une catégorie.' })
    const data = await googleJson('https://mybusinessbusinessinformation.googleapis.com/v1/categories?regionCode=FR&languageCode=fr&pageSize=100', { headers: { Authorization: `Bearer ${accessToken}` } })
    res.status(200).json({ categories: (data.categories || []).map(category => ({ name: category.name, label: category.displayName || category.name })) })
  } catch (error) { res.status(400).json({ error: error.message }) }
}

async function location(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  const payload = locationPayload(req.body)
  if (!payload) return res.status(400).json({ error: 'Veuillez renseigner le nom, la catégorie, le téléphone et une description de votre entreprise.' })
  try {
    const accessToken = await getGoogleAccessToken(user.id)
    if (!accessToken) return res.status(400).json({ error: 'Connectez Google avant de créer votre fiche.' })
    const account = await getGoogleAccount(accessToken)
    const query = new URLSearchParams({ requestId: randomUUID() })
    const validateOnly = req.body.operation === 'validate'
    if (validateOnly) query.set('validateOnly', 'true')
    const data = await googleJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?${query}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (validateOnly) return res.status(200).json({ valid: true, message: 'Les informations sont prêtes. Vous pouvez maintenant créer la fiche.' })
    res.status(201).json({ created: true, location: data.name, title: data.title, message: 'Votre fiche a été créée. Google vous demandera ensuite de vérifier que l’entreprise vous appartient.' })
  } catch (error) { res.status(400).json({ error: error.message }) }
}

async function reply(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res); if (!user) return
  const reviewId = clean(req.body.review_id, 300); const reviewName = clean(req.body.review_name, 500); const replyText = clean(req.body.reply_text, 4000)
  if (!reviewId || !reviewName || !replyText) return res.status(400).json({ error: 'Avis ou réponse manquant' })
  if (!/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(reviewName)) return res.status(400).json({ error: 'Référence de l’avis Google invalide.' })
  try {
    const accessToken = await getGoogleAccessToken(user.id)
    if (!accessToken) return res.status(400).json({ error: 'Google non connecté' })
    await googleJson(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: replyText }) })
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    await supabase.from('reviews').update({ reply: replyText }).eq('id', reviewId).eq('user_id', user.id)
    res.status(200).json({ success: true })
  } catch (error) { res.status(error.status || 500).json({ error: googleBusinessMessage(error) }) }
}

function googleBusinessMessage(error) {
  if (error?.status === 429 || error?.code === 'RESOURCE_EXHAUSTED') return 'Google Business n’a pas encore accordé l’accès API à Reputeo. Votre connexion est conservée ; la synchronisation des fiches et avis commencera après validation par Google.'
  if (error?.status === 403) return 'Google refuse encore cet accès. Vérifiez que le compte connecté est bien propriétaire ou gestionnaire de la fiche Google Business concernée.'
  return error?.message || 'Google Business n’a pas pu traiter cette demande.'
}

function locationPayload(body = {}) { const title = clean(body.title, 100), category = clean(body.category, 220), phone = clean(body.phone, 40), description = clean(body.description, 750), website = clean(body.website, 220); if (!title || !category || !phone || !description) return null; const location = { title, languageCode: 'fr', categories: { primaryCategory: { name: category } }, phoneNumbers: { primaryPhone: phone }, profile: { description }, serviceArea: { businessType: 'CUSTOMER_LOCATION_ONLY', regionCode: 'FR' } }; if (website && /^https?:\/\//i.test(website)) location.websiteUri = website; return location }
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function signedState(userId, secret) { const payload = `${userId}.${Math.floor(Date.now() / 1000)}`; return `${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', secret).update(payload).digest('base64url')}` }
function verifiedState(state, secret) { if (typeof state !== 'string') return null; const [encoded, signature] = state.split('.'); if (!encoded || !signature) return null; const payload = Buffer.from(encoded, 'base64url').toString('utf8'); const [userId, issuedAt] = payload.split('.'); const expected = createHmac('sha256', secret).update(payload).digest('base64url'); if (!userId || !issuedAt || Date.now() / 1000 - Number(issuedAt) > 600 || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; return { userId } }
