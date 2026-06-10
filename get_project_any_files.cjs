const fs = require('fs');

const data = fs.readFileSync('eslint_results.json', 'utf8');
const results = JSON.parse(data);

const filesWithAny = [];

for (const file of results) {
  let anyCount = 0;
  for (const msg of file.messages) {
    if (msg.ruleId === '@typescript-eslint/no-explicit-any') {
      anyCount++;
    }
  }
  if (anyCount > 0) {
    filesWithAny.push({ path: file.filePath, count: anyCount });
  }
}

filesWithAny.sort((a, b) => b.count - a.count);
for (const f of filesWithAny.slice(0, 5)) {
    console.log(`${f.count} - ${f.path}`);
}
