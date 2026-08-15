import { requireUser } from '../lib/session.js'
import { requirePremiumAccess } from '../lib/access.js'

function text(value, maxLength = 600) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
}

function textList(value) {
  if (!Array.isArray(value)) return []
  return value.map(item => text(item, 240)).filter(Boolean).slice(0, 6)
}

function cleanAnalysis(value) {
  const sentiment = ['Positif', 'Négatif', 'Neutre'].includes(value?.sentiment) ? value.sentiment : 'Neutre'
  const rawScore = Number(value?.score)
  const score = Number.isFinite(rawScore) ? Math.max(1, Math.min(10, Math.round(rawScore))) : 5

  return {
    sentiment,
    score,
    points_positifs: textList(value?.points_positifs),
    points_negatifs: textList(value?.points_negatifs),
    resume: text(value?.resume, 700),
    suggestion: text(value?.suggestion, 700)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireUser(req, res)
  if (!user) return
  if (!await requirePremiumAccess(user, res)) return

  const review = String(req.body?.review || '').trim()
  if (!review) return res.status(400).json({ error: 'Avis manquant' });
  if (review.length > 6000) return res.status(400).json({ error: 'L’avis est trop long (6 000 caractères maximum).' })

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: `Tu es un expert en analyse d'avis clients pour des commerces. Analyse l'avis donné et réponds UNIQUEMENT en JSON valide avec ce format exact, sans aucun texte avant ou après:
{
  "sentiment": "Positif" ou "Négatif" ou "Neutre",
  "score": nombre entre 1 et 10,
  "points_positifs": ["point1", "point2"],
  "points_negatifs": ["point1", "point2"],
  "resume": "résumé en 1 phrase",
  "suggestion": "suggestion concrète pour le commerçant en 1 phrase"
}`,
        messages: [{ role: "user", content: `Analyse cet avis client: "${review}"` }]
      })
    });

    const data = await response.json();
    if (!data.content || !data.content[0]) {
      throw new Error('Réponse API invalide: ' + JSON.stringify(data));
    }
    const raw = data.content[0].text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    res.status(200).json(cleanAnalysis(parsed));
  } catch (e) {
    console.error('Analyse IA error:', e);
    res.status(502).json({ error: 'L’analyse est momentanément indisponible. Réessayez dans quelques instants.' });
  }
}
