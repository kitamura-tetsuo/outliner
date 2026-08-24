const fs = require('fs');
const html = fs.readFileSync('add_db.html', 'utf8');

const match = html.match(/<dialog[^>]*>([\s\S]*?)<\/dialog>/i) || html.match(/class="[^"]*modal[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
if (match) {
  console.log("Dialog text:", match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
} else {
  console.log("No dialog found");
}
