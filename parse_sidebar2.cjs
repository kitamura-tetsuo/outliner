const fs = require('fs');
const html = fs.readFileSync('dom.html', 'utf8');

// Find the sidebar container and output the text directly
const match = html.match(/<aside[^>]*>([\s\S]*?)<\/aside>/i);
if (match) {
  // Strip tags and normalize spaces to see what's actually there
  console.log("Aside text:", match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
} else {
  // Maybe there is no <aside> tag. Let's look for a nav with sidebar classes
  const navMatches = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/ig);
  navMatches.forEach((m, i) => {
    console.log(`Nav ${i}:`, m.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  });
}
