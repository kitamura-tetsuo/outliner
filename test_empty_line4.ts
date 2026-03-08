import { Project } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!;

console.log("pageItem.text:", pageItem.text);
console.log("pageItem.items[0].text:", pageItem.items.at(0)?.text);
console.log("pageItem.items[1].text:", pageItem.items.at(1)?.text);
