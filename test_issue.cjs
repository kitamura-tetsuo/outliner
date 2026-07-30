const fs = require('fs');

let fileContent = fs.readFileSync('client/src/components/GlobalTextArea.svelte', 'utf8');

const regex = /\.global-textarea\s*\{[^}]*\}/;
console.log(fileContent.match(regex)[0]);
