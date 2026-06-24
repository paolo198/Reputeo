import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://cqgbxslhggexjjgkagtq.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
)

const USER_ID = '5497aeb1-66f3-4b83-9afb-de5cd58eb1b8'

const fakeReviews = [
  { id: 'fake_001', author: 'Jean-Pierre Moreau', rating: 5, text: 'Excellent accueil, personnel très professionnel. Je recommande vivement !', date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_002', author: 'Sophie Blanchard', rating: 4, text: 'Très bonne expérience globale. Quelques petits détails à améliorer mais dans l\'ensemble très satisfaite.', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_003', author: 'Marc Dupuis', rating: 2, text: 'Attente beaucoup trop longue, plus d\'une heure. Le service ne correspond pas au prix pratiqué.', date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_004', author: 'Isabelle Petit', rating: 5, text: 'Parfait ! Qualité irréprochable, personnel souriant et attentionné. On reviendra avec plaisir.', date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_005', author: 'Thomas Renard', rating: 3, text: 'Correct sans plus. Rien d\'exceptionnel mais rien à redire non plus.', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_006', author: 'Camille Rousseau', rating: 5, text: 'Je suis bluffée par la qualité du service ! Vraiment au top, bravo à toute l\'équipe.', date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_007', author: 'Antoine Bernard', rating: 1, text: 'Très déçu. Mauvais accueil, personnel peu aimable et prix excessifs. Je ne reviendrai pas.', date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_008', author: 'Lucie Martin', rating: 4, text: 'Bonne qualité de service, personnel compétent. L\'attente était un peu longue mais ça valait le coup.', date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_009', author: 'Pierre Leclerc', rating: 5, text: 'Superbe expérience ! Tout était parfait du début à la fin. Je recommande à 100%.', date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_010', author: 'Nathalie Girard', rating: 2, text: 'Déçue par rapport à mes attentes. Le rapport qualité/prix n\'est vraiment pas là.', date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_011', author: 'François Dubois', rating: 5, text: 'Accueil chaleureux, service rapide et efficace. Une vraie perle !', date: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_012', author: 'Émilie Lambert', rating: 4, text: 'Très bien dans l\'ensemble. Personnel agréable et professionnel.', date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_013', author: 'Nicolas Fournier', rating: 3, text: 'Moyen. On s\'attendait à mieux pour le prix. L\'attente était trop longue.', date: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_014', author: 'Aurélie Simon', rating: 5, text: 'Magnifique expérience ! Personnel aux petits soins, qualité exceptionnelle. Merci !', date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_015', author: 'Julien Michel', rating: 4, text: 'Très satisfait de ma visite. Bonne ambiance et service de qualité.', date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_016', author: 'Céline Durand', rating: 2, text: 'Pas du tout à la hauteur. Personnel peu attentif et temps d\'attente interminable.', date: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_017', author: 'Maxime Leroy', rating: 5, text: 'Wow ! Vraiment impressionné par la qualité. Je reviendrai sans hésiter et recommande à tous.', date: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_018', author: 'Stéphanie Morel', rating: 4, text: 'Belle découverte ! Accueil sympathique et service soigné.', date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_019', author: 'David Garnier', rating: 3, text: 'Expérience correcte. Rien d\'extraordinaire mais le service était correct.', date: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'fake_020', author: 'Laura Fontaine', rating: 5, text: 'Absolument parfait ! Je n\'ai rien à redire, tout était au top. Bravo !', date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() },
]

const { error } = await sb.from('reviews').upsert(
  fakeReviews.map(r => ({ ...r, user_id: USER_ID, platform: 'google', reply: null })),
  { onConflict: 'id' }
)

if (error) console.error('Erreur:', error)
else console.log('20 avis insérés avec succès !')
