const fs = require("fs");
const content = fs.readFileSync("client/src/stores/store.svelte.ts", "utf8");

const regex3 = /import \{.*getCurrentContent.*\} from "\.\.\/services";/s;
console.log(regex3.test(content));

const regex4 = /import \{.*addSnapshot.*\} from ".*"/;
console.log(content.match(regex4));
