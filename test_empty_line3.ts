import { Project, Item } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!;

// The Svelte file does this:
const rootChildren = pageItem.items;
const len = rootChildren.length;
for (let k = 0; k < len; k++) {
    const child = rootChildren.at(k);
    console.log("child at", k, child?.text);
}
