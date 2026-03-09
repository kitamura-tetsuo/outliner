import * as Y from "yjs";
import { Item, Project } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!; // this is how it might be accessed

console.log("pageItem.items:", typeof pageItem.items, pageItem.items.length);
console.log("pageItem.items[0]:", pageItem.items.at(0));
console.log("pageItem.items[0].text:", pageItem.items.at(0)?.text);

const rootChildren = pageItem.items;
const len = rootChildren.length;
for (let k = 0; k < len; k++) {
    const child = rootChildren.at(k);
    console.log("child text:", child?.text);
}
