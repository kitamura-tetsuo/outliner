const fs = require('fs');
const path = require('path');

const jaRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.svelte-kit'];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!ignoreDirs.includes(file)) {
        walkDir(fullPath);
      }
    } else {
      if (file.includes('.ja.')) continue;
      if (file.match(/\.(ts|js|svelte|md)$/)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (jaRegex.test(content)) {
            console.log(fullPath);
          }
        } catch (e) {}
      }
    }
  }
}

walkDir('client/e2e');
