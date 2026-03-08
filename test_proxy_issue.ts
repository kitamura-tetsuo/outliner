import { Project } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!;

console.log("pageItem.items type:", typeof pageItem.items);
console.log("pageItem.items instanceof Array:", pageItem.items instanceof Array);
console.log("pageItem.items.length:", pageItem.items.length);
console.log("pageItem.items.at(0):", pageItem.items.at(0)?.text);

// this is exactly what PageListItem.svelte does:
const children = pageItem.items;
const len = children.length;
for (let k = 0; k < len; k++) {
    const child = children.at(k);
    console.log("k=", k, "child text:", child?.text);
}
