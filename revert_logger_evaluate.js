const fs = require('fs');

function revertEvaluate(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  let inEval = false;
  let inEvalBraces = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('page.evaluate') || line.includes('page.waitForFunction')) {
      inEval = true;
      inEvalBraces = 0;
    }

    if (inEval) {
      // count braces if simple
      inEvalBraces += (line.match(/\{/g) || []).length;
      inEvalBraces -= (line.match(/\}/g) || []).length;

      lines[i] = lines[i]
        .replace(/logger\.info/g, 'console.log')
        .replace(/logger\.error/g, 'console.error')
        .replace(/logger\.warn/g, 'console.warn');

      if (inEvalBraces <= 0 && (line.includes(');') || line.includes('},'))) {
         // simple heuristic, might not perfectly catch all cases but let's see
      }
    }
  }

  fs.writeFileSync(filepath, lines.join('\n'));
}

// Since my manual fixes missed something, maybe it's best to just run a quick Node script that parses accurately,
// but the easiest is just manually doing it using replace.
// Let's find exactly what line was failing in CI:
// Error: page.waitForFunction: ReferenceError: logger is not defined
// at prepareTwoFullBrowserPages (client/src/lib/yjs/testHelpers.ts:508:17)
