const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// Stocker les avis dans reviewsData dans displayReviews
html = html.replace(
  'function displayReviews(reviews) {',
  "function displayReviews(reviews) {\n  reviews.forEach(r => { reviewsData[r.id] = { text: r.text||'', rating: r.rating, author: r.author } })"
);

// Remplacer la signature de la fonction generateReply
html = html.replace(
  'const reviewsData = {}\n\nasync function generateReply(reviewId) {',
  'async function generateReply(reviewId) {'
);

// Ajouter reviewsData avant generateReply
html = html.replace(
  'async function generateReply(reviewId) {',
  'const reviewsData = {}\n\nasync function generateReply(reviewId) {'
);

// Remplacer les paramètres dans le bouton
html = html.replace(
  /onclick="generateReply\('[^']*','[^']*',[^,]*,'[^']*'\)"/g,
  "onclick=\"generateReply('${r.id}')\""
);

fs.writeFileSync('dashboard.html', html);
console.log('OK');
