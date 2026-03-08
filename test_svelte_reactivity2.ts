import { Project, Item } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");
console.log(page.items.length);
for (let i = 0; i < page.items.length; i++) {
    console.log(page.items[i]?.text);
}
