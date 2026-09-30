const fs = require('fs');

const data = JSON.parse(fs.readFileSync('all-links.json', 'utf8'));
const sidebarItems = data.filter(item => item.parentHTML.includes('sidebar-section'));

console.log(sidebarItems.map(i => ({text: i.text.trim(), aria: i.ariaLabel, href: i.href})));
