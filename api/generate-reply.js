import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '../lib/session.js'
import { requirePremiumAccess } from '../lib/access.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = await requireUser(req, res)
  if (!user) return
  if (!await requirePremiumAccess(user, res)) return
  
  const { review_text, rating, author, prompt_override, max_tokens, attachment } = req.body || {}
  const safeReview = String(review_text || '').trim().slice(0, 6000)
  const safeAuthor = String(author || '').trim().slice(0, 120)
  const safePromptOverride = String(prompt_override || '').trim()
  if (safePromptOverride.length > 8000) return res.status(400).json({ error: 'Votre demande est trop longue.' })
  
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let prompt
  if (safePromptOverride) {
    prompt = safePromptOverride
  } else {
    const tone = rating >= 4 ? 'chaleureux et reconnaissant' : rating <= 2 ? 'empathique et constructif' : 'professionnel et attentionné'
    prompt = `Tu es un assistant qui aide les commerçants à répondre à leurs avis Google. Génère une réponse ${tone} à cet avis. La réponse doit être courte (2-3 phrases max), naturelle, personnalisée et en français. Ne commence pas par "Bonjour" générique, utilise le prénom si disponible.

Auteur : ${safeAuthor || 'Client'}
Note : ${rating || 5}/5
Avis : ${safeReview || 'Très bon service'}

Réponds uniquement avec le texte de la réponse, sans guillemets ni explication.`
  }

  const content = [{ type: 'text', text: prompt }]
  if (attachment) {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    const mediaType = String(attachment.media_type || '')
    const imageData = String(attachment.data || '')
    // Screenshots are analysed transiently for the answer and are never stored by Reputeo.
    if (!allowedTypes.has(mediaType) || !imageData || imageData.length > 7_000_000) {
      return res.status(400).json({ error: 'La pièce jointe doit être une image JPG, PNG ou WebP de moins de 5 Mo.' })
    }
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } })
  }

  try {
    const requestedTokens = Number(max_tokens)
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: Number.isFinite(requestedTokens) ? Math.min(Math.max(requestedTokens, 80), 1000) : 1000,
      messages: [{ role: 'user', content }]
    })
    res.json({ reply: String(message.content?.[0]?.text || '').slice(0, 12000) })
  } catch (error) {
    console.error('Generate reply error:', error)
    res.status(502).json({ error: 'L’assistant est momentanément indisponible. Réessayez dans quelques instants.' })
  }
}
