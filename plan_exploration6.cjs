const fs = require('fs');
const content = fs.readFileSync('client/src/stores/store.svelte.ts', 'utf8');

const regex = /import \{.*addSnapshot.*\} from "\.\.\/services";/s;
console.log(regex.test(content));

const regex2 = /import \{.*addSnapshot.*\} from "\.\.\/services\/snapshotService";/s;
console.log(regex2.test(content));
