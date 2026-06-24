const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// 1. Corriger le bouton ligne 324
html = html.replace(
  `<button onclick="generateReply('\${r.id}','\${(r.text||'').substring(0,200)}',\${r.rating},'\${r.author}')"`,
  `<button onclick="generateReply('\${r.id}')"`
);

// 2. Corriger la fonction generateReply
html = html.replace(
  `async function generateReply(reviewId, text, rating, author) {
  const btn = document.querySelector(\`button[onclick*='generateReply(\\\\\\"'\${reviewId}']\`)`,
  `const reviewsData = {}

async function generateReply(reviewId) {
  const r = reviewsData[reviewId] || {}
  const text = r.text || ''
  const rating = r.rating || 5
  const author = r.author || ''
  const btn = document.querySelector('[onclick="generateReply(\\'' + reviewId + '\\')"]')`
);

// 3. Stocker les avis dans displayReviews
html = html.replace(
  'function displayReviews(reviews) {',
  `function displayReviews(reviews) {
  reviews.forEach(rv => { reviewsData[rv.id] = { text: rv.text||'', rating: rv.rating, author: rv.author } })`
);

fs.writeFileSync('dashboard.html', html);
console.log('OK');
