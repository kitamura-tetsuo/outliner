const fs = require('fs');
let content = fs.readFileSync('client/src/lib/yjs/testHelpers.ts', 'utf8');

// The issue is that logger.* is called inside page.evaluate() and page.waitForFunction(),
// where the browser context does not have access to the Node.js `logger` instance.
// We must revert logger.info -> console.log and logger.error -> console.error
// inside those specific blocks, or just change it back to console.log globally in this file
// if it's meant to run in the browser console.

// To be safe, let's revert logger.* back to console.* inside page.evaluate and page.waitForFunction.

// Actually, since this is a test helper script (running in Node but partially in Browser),
// it's safer to revert all logger.* inside page.evaluate(...) back to console.*

// Wait, the previous PR was about replacing console.* with logger.* methods.
// But some console.* were legitimately browser console.* calls.
// Let's look for `page.evaluate(` and replace `logger.info` -> `console.log` and `logger.error` -> `console.error` inside it.

// Let's just use a regex to revert logger back to console inside `page.evaluate` blocks.
const lines = content.split('\n');
let inBrowserContext = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('page.evaluate') || lines[i].includes('page.waitForFunction')) {
        inBrowserContext = true;
    }
    if (inBrowserContext) {
        lines[i] = lines[i].replace(/logger\.info/g, 'console.log');
        lines[i] = lines[i].replace(/logger\.error/g, 'console.error');
        lines[i] = lines[i].replace(/logger\.warn/g, 'console.warn');
    }
    if (inBrowserContext && lines[i].includes('});') || (inBrowserContext && lines[i].includes(');') && !lines[i].includes('=>'))) {
        // basic heuristic
        if (lines[i].trim() === '});' || lines[i].trim() === ');' || lines[i].trim() === '},' || lines[i].trim() === '{ pv: providerVar });' || lines[i].trim() === '{ pid: projectId, docVar, providerVar, enableLogging, importPath },' || lines[i].trim() === '{ docVar, counterVar, counterV2Var },' || lines[i].trim() === 'null,' || lines[i].trim() === '{ timeout: 60000 },') {
            // Keep going if it's an arg, but let's just turn off at the end of function
            // Actually it's easier to just look at line numbers.
        }
    }
}
// This heuristic is weak. Let's just manually replace the specific lines based on the grep output.
