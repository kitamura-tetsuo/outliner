const fs = require('fs');
const html = fs.readFileSync('dom.html', 'utf8');

const regex = /<h3[^>]*class="[^"]*sidebar-section-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/ig;
let match;
while ((match = regex.exec(html)) !== null) {
  console.log("Section:", match[1].trim());
}
