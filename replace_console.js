const fs = require('fs');
const files = [
  'client/src/lib/yjs/testHelpers.ts',
  'client/src/app.html'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (file === 'client/src/lib/yjs/testHelpers.ts') {
     content = content.replace(/console\.log/g, 'logger.info');
     content = content.replace(/console\.error/g, 'logger.error');
     if (!content.includes('import { getLogger } from "../logger"')) {
         content = 'import { getLogger } from "../logger";\nconst logger = getLogger("testHelpers");\n' + content;
     }
  } else if (file === 'client/src/app.html') {
     content = content.replace(/console\.error\("/g, 'console.error("');
     // We can just leave app.html as is if it doesn't have access to logger. Or inject logger.
     // Let's replace with a more basic error handler or simply remove the console.error.
     // But wait, the app.html already uses structured logger?
     content = content.replace(/console\.error\("\[bootstrap\]/g, 'console.error("[bootstrap]');
  }
  fs.writeFileSync(file, content);
}
