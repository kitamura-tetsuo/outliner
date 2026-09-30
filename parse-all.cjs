const fs = require('fs');

const data = JSON.parse(fs.readFileSync('all-links.json', 'utf8'));

// Print everything that has 'href' that starts with '/' and is not a page
console.log("Internal routes:");
data.filter(i => i.href && i.href.startsWith('/') && !i.href.includes('/page/')).forEach(i => {
  console.log(i.text.trim().substring(0, 30) + ' -> ' + i.href);
});
