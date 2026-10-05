const fs = require('fs');

const en = fs.readFileSync('docs/user-manual/index.md', 'utf-8');
const ja = fs.readFileSync('docs/ja/user-manual/index.md', 'utf-8');

console.log("English 'lower toolbar' string present:", en.includes('The lower toolbar (part of the outline editor) provides:'));
console.log("Japanese 'lower toolbar' string present:", ja.includes('下部のツールバー（アウトラインエディタの一部）からは以下にアクセスできます：'));
