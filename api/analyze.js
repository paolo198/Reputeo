export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { review } = req.body;
  if (!review) return res.status(400).json({ error: 'Avis manquant' });

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
    res.status(200).json(parsed);
  } catch (e) {
    console.error('Erreur complète:', e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
