const fs = require("fs");
const content = fs.readFileSync("client/src/stores/store.svelte.ts", "utf8");

const saveProjectSnapshotMatch = content.match(/saveProjectSnapshot\(project\);/);
console.log("Found saveProjectSnapshot call?", !!saveProjectSnapshotMatch);
