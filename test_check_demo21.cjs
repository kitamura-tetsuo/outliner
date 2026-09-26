const fs = require('fs');

let tests = fs.readdirSync('client/src/components', { recursive: true }).filter(f => f.endsWith('.test.ts'));
for (const test of tests) {
    let content = fs.readFileSync('client/src/components/' + test, 'utf8');
    if (content.includes('fireEvent.keyDown(window, { key: "Escape" })')) {
        console.log("Escape keyDown window found in: " + test);
    }
}
