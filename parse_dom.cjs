const fs = require('fs');
const html = fs.readFileSync('dom.html', 'utf8');

const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/ig);
if (navMatch) {
  console.log("Nav contents:", navMatch[0].substring(0, 500) + '...');
} else {
  console.log("No nav element found.");
}

// look for words like "Scheduled SQL" or "Projects"
const indexSQL = html.indexOf('Scheduled');
console.log("Found Scheduled?", indexSQL !== -1 ? html.substring(indexSQL-50, indexSQL+50) : "no");
