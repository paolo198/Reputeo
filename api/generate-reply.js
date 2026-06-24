import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  
  const { review_text, rating, author } = req.body
  
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const tone = rating >= 4 ? 'chaleureux et reconnaissant' : rating <= 2 ? 'empathique et constructif' : 'professionnel et attentionné'

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Tu es un assistant qui aide les commerçants à répondre à leurs avis Google. Génère une réponse ${tone} à cet avis. La réponse doit être courte (2-3 phrases max), naturelle, personnalisée et en français. Ne commence pas par "Bonjour" générique, utilise le prénom si disponible.

Auteur : ${author || 'Client'}
Note : ${rating || 5}/5
Avis : ${review_text || 'Très bon service'}

Réponds uniquement avec le texte de la réponse, sans guillemets ni explication.`
    }]
  })

  res.json({ reply: message.content[0].text })
}
