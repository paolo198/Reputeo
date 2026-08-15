import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { requireUser } from '../lib/session.js'
import { requirePremiumAccess } from '../lib/access.js'

const APP_URL = 'https://reputeo.app'

async function requirePaidUser(req, res) {
  const user = await requireUser(req, res)
  if (!user) return null
  return await requirePremiumAccess(user, res) ? user : null
}

export default async function handler(req, res) {
  const action = req.query.action
  if (action === 'job-completed') return receiveCompletedJob(req, res)
  if (action === 'click') return trackReviewLinkClick(req, res)
  if (action === 'unsubscribe') return unsubscribeFromReviewRequests(req, res)
  if (action === 'manual-completion') return registerManualCompletion(req, res)
  if (action === 'clients') return manageClients(req, res)
  if (action === 'import-clients') return importClients(req, res)
  if (action === 'campaign') return sendReviewCampaign(req, res)
  if (action === 'history') return getAutomationHistory(req, res)
  if (action === 'cancel') return cancelScheduledRequest(req, res)
  if (action === 'config') return manageConfig(req, res)
  return res.status(400).json({ error: 'Action d’automatisation invalide.' })
}

async function manageConfig(req, res) {
  const user = await requirePaidUser(req, res)
  if (!user) return
  if (!signingSecret()) return res.status(503).json({ error: 'L’automatisation est en cours de sécurisation. Réessayez dans quelques instants.' })
  const supabase = adminClient()
  const existing = user.user_metadata?.reputeo_automation || {}

  if (req.method === 'GET') {
    return res.status(200).json({
      config: publicConfig(existing),
      webhook_url: webhookUrl(user.id)
    })
  }
  if (req.method !== 'POST') return res.status(405).end()

  const config = cleanConfig(req.body, existing)
  if (config.error) return res.status(400).json({ error: config.error })
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, reputeo_automation: config.value }
  })
  if (error) return res.status(500).json({ error: 'Impossible d’enregistrer les réglages.' })
  return res.status(200).json({ config: publicConfig(config.value), webhook_url: webhookUrl(user.id) })
}

async function receiveCompletedJob(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const userId = verifiedToken(req.query.token)
  if (!userId) return res.status(401).json({ error: 'Lien d’automatisation invalide.' })

  const email = String(req.body?.client_email || '').trim().toLowerCase()
  const firstname = String(req.body?.client_firstname || '').trim().slice(0, 80)
  const consent = req.body?.consent_to_review_request === true
  if (!validEmail(email)) return res.status(400).json({ error: 'Une adresse e-mail client valide est requise.' })
  if (!consent) return res.status(400).json({ error: 'Le consentement du client est requis avant tout envoi.' })

  const supabase = adminClient()
  const { data: { user }, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !user) return res.status(404).json({ error: 'Compte introuvable.' })
  if (!await requirePremiumAccess(user, res)) return
  const config = user.user_metadata?.reputeo_automation || {}
  if (!config.enabled || !isGoogleReviewLink(config.google_link) || !config.business_name) {
    return res.status(409).json({ error: 'L’automatisation Reputeo n’est pas encore activée.' })
  }
  if (isOptedOut(user, email)) return res.status(409).json({ error: 'Ce client a choisi de ne plus recevoir de demandes d’avis.' })

  try {
    const delayHours = Number(config.delay_hours || 0)
    const scheduledAt = delayHours > 0 ? new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString() : null
    const trackingId = randomUUID()
    const result = await scheduleReviewRequest({
      email,
      firstname,
      config,
      scheduledAt,
      userId,
      trackingId,
      idempotencyKey: requestIdempotencyKey(userId, email, req.body?.job_id || req.body?.completed_at)
    })
    try { await appendHistory(user, createHistoryRecord({ result, firstname, email, scheduledAt, trackingId }), upsertClient(user, firstname, email)) } catch (historyError) { console.error('Automation history error:', historyError) }
    return res.status(200).json({
      success: true,
      scheduled: Boolean(scheduledAt),
      scheduled_for: scheduledAt,
      email_id: result.id || null,
      message: scheduledAt ? 'Demande d’avis programmée.' : 'Demande d’avis envoyée.'
    })
  } catch (error) {
    console.error('Automation email error:', error)
    return res.status(502).json({ error: 'L’envoi de la demande d’avis a échoué.' })
  }
}

// This route is called only from the authenticated Reputeo interface.
// The business never has to see or copy a webhook URL.
async function registerManualCompletion(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requirePaidUser(req, res)
  if (!user) return

  const email = String(req.body?.client_email || '').trim().toLowerCase()
  const firstname = String(req.body?.client_firstname || '').trim().slice(0, 80)
  const consent = req.body?.consent_to_review_request === true
  if (!validEmail(email)) return res.status(400).json({ error: 'Une adresse e-mail client valide est requise.' })
  if (!consent) return res.status(400).json({ error: 'Confirmez que le client peut recevoir cette demande.' })

  const config = user.user_metadata?.reputeo_automation || {}
  if (!config.enabled || !isGoogleReviewLink(config.google_link) || !config.business_name) {
    return res.status(409).json({ error: 'Activez d’abord votre règle d’envoi dans cette page.' })
  }
  if (isOptedOut(user, email)) return res.status(409).json({ error: 'Ce client a choisi de ne plus recevoir de demandes d’avis.' })

  try {
    const delayHours = Number(config.delay_hours || 0)
    const scheduledAt = delayHours > 0 ? new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString() : null
    const trackingId = randomUUID()
    const result = await scheduleReviewRequest({
      email,
      firstname,
      config,
      scheduledAt,
      userId: user.id,
      trackingId,
      idempotencyKey: requestIdempotencyKey(user.id, email, req.body?.job_id)
    })
    const record = createHistoryRecord({ result, firstname, email, scheduledAt, trackingId })
    try { await appendHistory(user, record, upsertClient(user, firstname, email)) } catch (historyError) { console.error('Automation history error:', historyError) }
    return res.status(200).json({
      success: true,
      scheduled: Boolean(scheduledAt),
      scheduled_for: scheduledAt,
      email_id: result.id || null,
      record,
      message: scheduledAt ? 'Demande d’avis programmée.' : 'Demande d’avis envoyée.'
    })
  } catch (error) {
    console.error('Manual completion email error:', error)
    return res.status(502).json({ error: 'L’envoi de la demande d’avis a échoué. Réessayez dans quelques instants.' })
  }
}

async function getAutomationHistory(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const user = await requirePaidUser(req, res)
  if (!user) return
  const requests = historyFor(user)
  return res.status(200).json({ requests, stats: historyStats(requests) })
}

async function manageClients(req, res) {
  const user = await requirePaidUser(req, res)
  if (!user) return
  if (req.method === 'GET') return res.status(200).json({ clients: clientsFor(user) })
  if (req.method === 'DELETE') {
    const id = String(req.body?.id || '')
    const clients = clientsFor(user).filter(client => client.id !== id)
    try { await saveClients(user, clients) } catch (_) { return res.status(500).json({ error: 'Impossible de supprimer ce client.' }) }
    return res.status(200).json({ success: true, clients })
  }
  return res.status(405).end()
}

async function importClients(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requirePaidUser(req, res)
  if (!user) return
  if (req.body?.consent_to_review_request !== true) {
    return res.status(400).json({ error: 'Confirmez que ces clients peuvent recevoir une demande d’avis.' })
  }

  const candidates = Array.isArray(req.body?.clients) ? req.body.clients.slice(0, 50) : []
  if (!candidates.length) return res.status(400).json({ error: 'Ajoutez au moins un client valide.' })

  let clients = clientsFor(user)
  let imported = 0
  for (const candidate of candidates) {
    const email = String(candidate?.email || '').trim().toLowerCase()
    const firstname = String(candidate?.firstname || '').trim().slice(0, 80)
    if (!validEmail(email) || isOptedOut(user, email)) continue
    const index = clients.findIndex(client => client.email.toLowerCase() === email)
    const client = { id: index >= 0 ? clients[index].id : randomUUID(), firstname: firstname || (index >= 0 ? clients[index].firstname : ''), email }
    if (index >= 0) clients[index] = client
    else { clients.unshift(client); imported += 1 }
  }
  clients = clients.slice(0, 200)
  if (!clients.length) return res.status(400).json({ error: 'Aucun e-mail importable. Vérifiez les adresses et les désinscriptions.' })
  try {
    await saveClients(user, clients)
    return res.status(200).json({ success: true, imported, clients })
  } catch (_) {
    return res.status(500).json({ error: 'Impossible d’enregistrer ces clients.' })
  }
}

async function sendReviewCampaign(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requirePaidUser(req, res)
  if (!user) return
  if (req.body?.consent_to_review_request !== true) {
    return res.status(400).json({ error: 'Confirmez que les destinataires ont accepté de recevoir cette demande.' })
  }
  const config = user.user_metadata?.reputeo_automation || {}
  if (!config.enabled || !isGoogleReviewLink(config.google_link) || !config.business_name) {
    return res.status(409).json({ error: 'Activez d’abord votre règle d’envoi.' })
  }

  const selectedIds = [...new Set(Array.isArray(req.body?.client_ids) ? req.body.client_ids.map(String) : [])].slice(0, 50)
  const delayHours = Number(req.body?.delay_hours)
  const followUp = req.body?.follow_up === true
  if (!selectedIds.length) return res.status(400).json({ error: 'Sélectionnez au moins un client.' })
  if (![0, 2, 24, 72].includes(delayHours)) return res.status(400).json({ error: 'Choisissez un délai valide.' })

  const selectedClients = clientsFor(user).filter(client => selectedIds.includes(client.id) && !isOptedOut(user, client.email))
  if (!selectedClients.length) return res.status(400).json({ error: 'Aucun destinataire éligible n’a été trouvé.' })

  const scheduledAt = delayHours > 0 ? new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString() : null
  const followUpAt = followUp ? new Date((scheduledAt ? new Date(scheduledAt).getTime() : Date.now()) + 24 * 60 * 60 * 1000).toISOString() : null
  const records = []
  const failures = []
  for (const client of selectedClients) {
    try {
      const trackingId = randomUUID()
      const result = await scheduleReviewRequest({
        email: client.email,
        firstname: client.firstname,
        config,
        scheduledAt,
        followUpAt,
        userId: user.id,
        trackingId,
        idempotencyKey: requestIdempotencyKey(user.id, client.email, `campaign-${Date.now()}`)
      })
      records.push(createHistoryRecord({ result, firstname: client.firstname, email: client.email, scheduledAt, trackingId }))
    } catch (error) {
      console.error('Campaign recipient error:', error)
      failures.push(client.id)
    }
  }
  if (!records.length) return res.status(502).json({ error: 'Aucune demande n’a pu être programmée. Réessayez dans quelques instants.' })
  try {
    await saveHistory(user, [...records, ...historyFor(user)].slice(0, 100), clientsFor(user))
  } catch (_) {
    return res.status(500).json({ error: 'Les demandes sont programmées, mais leur historique n’a pas pu être enregistré.' })
  }
  return res.status(200).json({
    success: true,
    sent: records.length,
    skipped: selectedClients.length - records.length,
    scheduled_for: scheduledAt,
    follow_up: Boolean(followUpAt),
    message: `${records.length} demande${records.length > 1 ? 's' : ''} ${scheduledAt ? 'programmée' : 'envoyée'}${records.length > 1 ? 's' : ''}.`
  })
}

// Public link used only inside an e-mail. It records an anonymous click and
// immediately redirects the customer to the business's genuine Google review link.
async function trackReviewLinkClick(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const tracked = verifiedTrackingToken(req.query.token)
  if (!tracked) return res.status(400).send('Ce lien de demande d’avis n’est plus valide.')
  const supabase = adminClient()
  const { data: { user }, error } = await supabase.auth.admin.getUserById(tracked.userId)
  if (error || !user) return res.status(404).send('Cette demande d’avis est introuvable.')
  const config = user.user_metadata?.reputeo_automation || {}
  if (!isGoogleReviewLink(config.google_link)) return res.status(410).send('Le lien Google de cette entreprise n’est plus disponible.')

  const history = historyFor(user)
  const request = history.find(item => item.tracking_id === tracked.trackingId)
  if (!request) return res.status(404).send('Cette demande d’avis est introuvable.')
  if (!request.clicked_at && request.status !== 'annulee') {
    const followupCancelled = await cancelResendEmail(request.followup_email_id)
    const updated = history.map(item => item.tracking_id === tracked.trackingId
      ? { ...item, clicked_at: new Date().toISOString(), ...(followupCancelled ? { followup_status: 'annulee', followup_cancelled_at: new Date().toISOString() } : {}) }
      : item)
    try { await saveHistory(user, updated) } catch (error) { console.error('Review click tracking error:', error) }
  }
  res.setHeader('Cache-Control', 'no-store, private')
  return res.redirect(302, config.google_link)
}

// Public link included in every new review-request e-mail. It blocks future
// automated requests to this recipient for this Reputeo account.
async function unsubscribeFromReviewRequests(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const tracked = verifiedTrackingToken(req.query.token)
  if (!tracked) return res.status(400).send('Ce lien de désinscription n’est plus valide.')
  const { data: { user }, error } = await adminClient().auth.admin.getUserById(tracked.userId)
  if (error || !user) return res.status(404).send('Cette demande est introuvable.')
  const history = historyFor(user)
  const request = history.find(item => item.tracking_id === tracked.trackingId)
  if (!request?.recipient_hash) return res.status(410).send('Cette demande est trop ancienne pour être désinscrite automatiquement.')
  const optOuts = optOutsFor(user)
  if (!optOuts.includes(request.recipient_hash)) optOuts.unshift(request.recipient_hash)
  const followupCancelled = await cancelResendEmail(request.followup_email_id)
  const updatedHistory = history.map(item => item.tracking_id === tracked.trackingId
    ? {
        ...item,
        unsubscribed_at: item.unsubscribed_at || new Date().toISOString(),
        ...(followupCancelled ? { followup_status: 'annulee', followup_cancelled_at: new Date().toISOString() } : {})
      }
    : item)
  try { await saveHistory(user, updatedHistory, clientsFor(user), optOuts.slice(0, 500)) } catch (_) { return res.status(500).send('Impossible d’enregistrer votre désinscription. Réessayez plus tard.') }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Désinscription confirmée</title><body style="margin:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#172033"><main style="max-width:560px;margin:72px auto;padding:36px;background:#fff;border:1px solid #dbe7e4;border-radius:18px;text-align:center"><div style="font-size:32px">✓</div><h1 style="font-size:25px">C’est enregistré.</h1><p style="line-height:1.6;color:#526277">Vous ne recevrez plus de demandes d’avis automatiques de cette entreprise via Reputeo.</p></main></body></html>')
}

async function cancelScheduledRequest(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res)
  if (!user) return
  const id = String(req.body?.id || '')
  const history = historyFor(user)
  const request = history.find(item => item.id === id)
  if (!request || request.status !== 'programmee' || !request.email_id) {
    return res.status(404).json({ error: 'Cette demande ne peut plus être annulée.' })
  }
  try {
    const cancelled = await cancelResendEmail(request.email_id)
    if (!cancelled) throw new Error('L’e-mail ne peut plus être annulé.')
    const followupCancelled = await cancelResendEmail(request.followup_email_id)
    const updated = history.map(item => item.id === id ? { ...item, status: 'annulee', cancelled_at: new Date().toISOString(), ...(followupCancelled ? { followup_status: 'annulee' } : {}) } : item)
    await saveHistory(user, updated)
    return res.status(200).json({ success: true, request: updated.find(item => item.id === id) })
  } catch (error) {
    console.error('Automation cancellation error:', error)
    return res.status(502).json({ error: 'Impossible d’annuler cette demande pour le moment.' })
  }
}

async function scheduleReviewRequest({ email, firstname, config, scheduledAt, followUpAt = null, userId, trackingId, idempotencyKey }) {
  const greeting = firstname ? `Bonjour ${escapeHtml(firstname)},` : 'Bonjour,'
  const business = escapeHtml(config.business_name)
  const senderName = safeSenderName(config.business_name)
  const businessInitial = escapeHtml((String(config.business_name || 'E').trim().charAt(0) || 'E').toUpperCase())
  const trackedGoogleLink = `${APP_URL}/api/automation?action=click&token=${encodeURIComponent(trackingToken(userId, trackingId))}`
  const unsubscribeLink = `${APP_URL}/api/automation?action=unsubscribe&token=${encodeURIComponent(trackingToken(userId, trackingId))}`
  const payload = {
    // The visible sender is the business. The technical sending address remains
    // Reputeo's verified domain until the business connects its own domain.
    from: `${senderName} <noreply@reputeo.app>`,
    to: [email],
    subject: `${firstname ? `${firstname}, votre` : 'Votre'} avis compte pour ${config.business_name}`,
    html: `<div style="background:#f4f7f6;padding:32px 16px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe7e4;border-radius:18px;overflow:hidden"><div style="padding:26px 30px;background:#172033;color:#fff"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:38px;height:38px;background:#8ed8c8;border-radius:10px;text-align:center;font-size:18px;font-weight:bold;color:#172033">${businessInitial}</td><td style="padding-left:11px;font-size:16px;font-weight:bold">${business}</td></tr></table></div><div style="padding:34px 30px 30px"><h1 style="font-size:25px;line-height:1.2;margin:0 0 18px;color:#172033">${greeting}</h1><p style="font-size:16px;line-height:1.7;margin:0 0 16px">Merci d’avoir fait confiance à <strong>${business}</strong>. Nous espérons que votre expérience s’est bien passée.</p><p style="font-size:16px;line-height:1.7;margin:0 0 25px">Votre retour aide notre équipe à progresser et aide les futurs clients à faire leur choix. Cela ne prend qu’une minute.</p><p style="margin:0 0 27px"><a href="${escapeAttribute(trackedGoogleLink)}" style="display:inline-block;padding:15px 21px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:bold;font-size:16px">Laisser mon avis sur Google</a></p><p style="font-size:13px;line-height:1.55;color:#667085;margin:0">Merci pour votre temps et votre confiance.<br><strong>${business}</strong></p></div><div style="padding:16px 30px;background:#f7faf9;border-top:1px solid #e5eeeb;font-size:12px;line-height:1.5;color:#667085">Vous recevez ce message après votre prestation auprès de ${business}. <a href="${escapeAttribute(unsubscribeLink)}" style="color:#526277">Ne plus recevoir ces demandes</a>.</div></div></div>`
  }
  if (scheduledAt) payload.scheduled_at = scheduledAt
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || data.error || 'Le service d’envoi n’a pas accepté la demande.')
  if (!followUpAt) return data
  const followUpPayload = {
    ...payload,
    subject: `${firstname ? `${firstname}, un` : 'Un'} petit rappel de ${config.business_name}`,
    scheduled_at: followUpAt,
    html: payload.html.replace('Nous espérons que votre expérience s’est bien passée.</p><p style="font-size:16px;line-height:1.7;margin:0 0 25px">Votre retour aide notre équipe à progresser et aide les futurs clients à faire leur choix. Cela ne prend qu’une minute.', 'nous vous écrivons une dernière fois.</p><p style="font-size:16px;line-height:1.7;margin:0 0 25px">Si vous avez une minute, votre retour aiderait beaucoup notre équipe et les futurs clients.')
  }
  try {
    const followUpResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': `${idempotencyKey}-followup` } : {}) },
      body: JSON.stringify(followUpPayload)
    })
    const followUpData = await followUpResponse.json().catch(() => ({}))
    if (!followUpResponse.ok) return { ...data, followup_scheduled_at: null }
    return { ...data, followup_id: followUpData.id || null, followup_scheduled_at: followUpAt }
  } catch (_) {
    return { ...data, followup_scheduled_at: null }
  }
}

function cleanConfig(body, existing) {
  const business_name = String(body?.business_name || '').trim().slice(0, 120)
  const google_link = String(body?.google_link || '').trim()
  const delay_hours = Number(body?.delay_hours)
  const enabled = body?.enabled === true
  if (!business_name) return { error: 'Indiquez le nom de votre entreprise.' }
  if (!isGoogleReviewLink(google_link)) return { error: 'Ajoutez le vrai lien d’avis Google de votre établissement (Google Business → Demander des avis).' }
  if (![0, 2, 24, 72].includes(delay_hours)) return { error: 'Choisissez un délai valide.' }
  return { value: { ...existing, business_name, google_link, delay_hours, enabled, updated_at: new Date().toISOString() } }
}

function publicConfig(config) {
  return { business_name: config.business_name || '', google_link: config.google_link || '', delay_hours: Number(config.delay_hours || 24), enabled: config.enabled === true }
}

function createHistoryRecord({ result, firstname, email, scheduledAt, trackingId }) {
  const now = new Date().toISOString()
  return {
    id: String(result.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    email_id: result.id || null,
    client: firstname || 'Client',
    email_masked: maskEmail(email),
    recipient_hash: emailFingerprint(email),
    status: scheduledAt ? 'programmee' : 'envoyee',
    tracking_id: trackingId,
    scheduled_at: scheduledAt || null,
    followup_email_id: result.followup_id || null,
    followup_scheduled_at: result.followup_scheduled_at || null,
    followup_status: result.followup_id ? 'programmee' : null,
    created_at: now
  }
}

function historyStats(history) {
  const active = history.filter(item => item.status !== 'annulee')
  const sent = active.filter(item => item.status === 'envoyee').length
  const scheduled = active.filter(item => item.status === 'programmee').length
  const opened = active.filter(item => Boolean(item.clicked_at)).length
  return { sent, scheduled, opened, awaiting: Math.max(0, sent - opened) }
}

function historyFor(user) {
  const history = user.user_metadata?.reputeo_automation_history
  return Array.isArray(history) ? history.slice(0, 100) : []
}

function clientsFor(user) {
  const clients = user.user_metadata?.reputeo_clients
  return Array.isArray(clients) ? clients.slice(0, 200).map(client => ({ id: String(client.id || ''), firstname: String(client.firstname || ''), email: String(client.email || '') })).filter(client => client.id && validEmail(client.email)) : []
}

function optOutsFor(user) {
  const optOuts = user.user_metadata?.reputeo_review_opt_outs
  return Array.isArray(optOuts) ? optOuts.filter(value => typeof value === 'string' && value.length === 43).slice(0, 500) : []
}

function isOptedOut(user, email) { return optOutsFor(user).includes(emailFingerprint(email)) }

function upsertClient(user, firstname, email) {
  const existing = clientsFor(user)
  const index = existing.findIndex(client => client.email.toLowerCase() === email.toLowerCase())
  const client = { id: index >= 0 ? existing[index].id : randomUUID(), firstname: firstname || (index >= 0 ? existing[index].firstname : ''), email }
  if (index >= 0) existing[index] = client
  else existing.unshift(client)
  return existing.slice(0, 200)
}

async function appendHistory(user, record, clients = clientsFor(user)) {
  const history = [record, ...historyFor(user)].slice(0, 100)
  return saveHistory(user, history, clients)
}

async function cancelResendEmail(emailId) {
  if (!emailId || !process.env.RESEND_API_KEY) return false
  try {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}/cancel`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
    })
    return response.ok
  } catch (_) {
    return false
  }
}

async function saveHistory(user, history, clients = clientsFor(user), optOuts = optOutsFor(user)) {
  const { error } = await adminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, reputeo_automation_history: history, reputeo_clients: clients, reputeo_review_opt_outs: optOuts }
  })
  if (error) throw new Error('Impossible d’enregistrer l’historique de la demande.')
}

async function saveClients(user, clients) {
  const { error } = await adminClient().auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, reputeo_clients: clients }
  })
  if (error) throw new Error('Impossible d’enregistrer les clients.')
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@')
  if (!domain) return 'Adresse masquée'
  return `${(local || '').slice(0, 1)}•••@${domain}`
}

function adminClient() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) }
function isHttpUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' } catch { return false } }
function isGoogleReviewLink(value) {
  if (!isHttpUrl(value)) return false
  const host = new URL(value).hostname.toLowerCase()
  return host === 'g.page' || host.endsWith('.g.page') || host === 'maps.app.goo.gl' || host.endsWith('.maps.app.goo.gl') || host === 'goo.gl' || host.endsWith('.goo.gl') || host === 'google.com' || host.endsWith('.google.com')
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function escapeAttribute(value) { return escapeHtml(value).replace(/'/g, '&#39;') }
function safeSenderName(value) { return String(value || 'Votre entreprise').replace(/[\r\n<>"']/g, '').trim().slice(0, 100) || 'Votre entreprise' }

function signingSecret() { return process.env.AUTOMATION_WEBHOOK_SECRET || '' }
function emailFingerprint(email) { return createHmac('sha256', signingSecret()).update(String(email || '').trim().toLowerCase()).digest('base64url') }
function sign(userId) { return createHmac('sha256', signingSecret()).update(userId).digest('base64url') }
function webhookToken(userId) { return `${Buffer.from(userId).toString('base64url')}.${sign(userId)}` }
function webhookUrl(userId) { return `${APP_URL}/api/automation?action=job-completed&token=${webhookToken(userId)}` }
function trackingToken(userId, trackingId) { return `${Buffer.from(userId).toString('base64url')}.${trackingId}.${createHmac('sha256', signingSecret()).update(`${userId}:${trackingId}`).digest('base64url')}` }
function verifiedTrackingToken(token) {
  if (!signingSecret() || typeof token !== 'string') return null
  const [encodedId, trackingId, signature] = token.split('.')
  if (!encodedId || !trackingId || !signature) return null
  let userId
  try { userId = Buffer.from(encodedId, 'base64url').toString('utf8') } catch { return null }
  const expected = createHmac('sha256', signingSecret()).update(`${userId}:${trackingId}`).digest('base64url')
  const left = Buffer.from(signature), right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right) ? { userId, trackingId } : null
}
function verifiedToken(token) {
  if (!signingSecret() || typeof token !== 'string') return null
  const [encodedId, signature] = token.split('.')
  if (!encodedId || !signature) return null
  let userId
  try { userId = Buffer.from(encodedId, 'base64url').toString('utf8') } catch { return null }
  const expected = sign(userId)
  const left = Buffer.from(signature), right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right) ? userId : null
}
function requestIdempotencyKey(userId, email, sourceId) {
  if (!sourceId) return null
  return `review-request-${createHmac('sha256', signingSecret()).update(`${userId}:${email}:${String(sourceId)}`).digest('hex')}`
}
