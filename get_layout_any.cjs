const fs = require('fs');

const content = fs.readFileSync('client/src/routes/+layout.svelte', 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('any')) {
    console.log(`${i+1}: ${lines[i]}`);
  }
}
