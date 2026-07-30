const fs = require('fs');
const content = fs.readFileSync('client/src/stores/store.svelte.ts', 'utf8');

const regex = /import \{ addSnapshot, getCurrentContent \} from "\.\.\/services";/;
console.log(regex.test(content));
