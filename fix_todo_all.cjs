const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.svelte')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const newContent = content.replace(/\s*\/\/\s*(TODO|FIXME)[\s:a-zA-Z0-9.,-]*$/gmi, '');
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent);
                console.log('Updated ' + fullPath);
            }
        }
    }
}

processDir('client/src');
processDir('server/src');
