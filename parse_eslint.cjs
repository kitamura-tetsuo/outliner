const fs = require('fs');
const results = JSON.parse(fs.readFileSync('eslint_results.json', 'utf8'));

let errors = 0;
let warnings = 0;
const issues = [];

results.forEach(file => {
  file.messages.forEach(msg => {
    if (msg.severity === 2) {
      errors++;
      issues.push(`ERROR in ${file.filePath}:${msg.line}:${msg.column} - ${msg.message} (${msg.ruleId})`);
    } else {
      warnings++;
      issues.push(`WARNING in ${file.filePath}:${msg.line}:${msg.column} - ${msg.message} (${msg.ruleId})`);
    }
  });
});

console.log(`Errors: ${errors}, Warnings: ${warnings}`);
console.log("First 20 issues:");
console.log(issues.slice(0, 20).join('\n'));
