const fs = require("fs");
let content = fs.readFileSync("client/src/components/OutlinerTree.svelte", "utf8");

// The active item index should determine the roving tabindex.
// If there is no active item, index 1 (the first child) should have tabindex=0
