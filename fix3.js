const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// Remplacer toute la fonction generateReply
const oldFn = `async function generateReply(reviewId, text, rating, author) {
  const btn = document.querySelector(\`button[onclick*='generateReply(\\\\\\"'\${reviewId}']\`)
  if (btn) { btn.textContent = '⏳ Génération...'; btn.disabled = true }
  
  // Ouvre le formulaire
  const form = document.getElementById('reply-form-' + reviewId)
  if (form) form.style.display = 'block'
  
  const res = await fetch('/api/generate-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_text: text, rating: rating, author: author })
  })
  const data = await res.json()`;

const newFn = `const reviewsData = {}

async function generateReply(reviewId) {
  const r = reviewsData[reviewId] || {}
  const text = r.text || ''
  const rating = r.rating || 5
  const author = r.author || ''
  const btn = document.querySelector('[onclick="generateReply(\\'' + reviewId + '\\')"]')
  if (btn) { btn.textContent = '⏳ Génération...'; btn.disabled = true }
  
  const form = document.getElementById('reply-form-' + reviewId)
  if (form) form.style.display = 'block'
  
  const res = await fetch('/api/generate-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_text: text, rating: rating, author: author })
  })
  const data = await res.json()`;

html = html.replace(oldFn, newFn);

// Ajouter stockage dans displayReviews
if (!html.includes('reviewsData[rv.id]')) {
  html = html.replace(
    'function displayReviews(reviews) {',
    `function displayReviews(reviews) {\n  reviews.forEach(rv => { reviewsData[rv.id] = { text: rv.text||'', rating: rv.rating, author: rv.author } })`
  );
}

fs.writeFileSync('dashboard.html', html);
console.log('OK');
