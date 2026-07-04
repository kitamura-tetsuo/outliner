const fs = require('fs');
const file = 'client/src/lib/KeyEventHandler.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(/        const k = \(event as KeyboardEvent\)\.key;\n\n        \/\/ Command Palette Interaction/g, '        // Command Palette Interaction');
fs.writeFileSync(file, code);
