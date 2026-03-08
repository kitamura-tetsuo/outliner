import { Project, Items, Item } from "./client/src/schema/app-schema.ts";

const proj = Project.createInstance("Test");
const page = proj.addPage("Page Title", "author");
const i1 = page.items.addNode("author");
i1.updateText("Line 1");
const i2 = page.items.addNode("author");
i2.updateText("Line 2");

const pageItem = proj.items.at(0)!;

// test how "length" is evaluated on items array like proxy in Svelte component context
function simulateSvelte(pageItem: Item) {
    const rootChildren = pageItem.items;

    // In Svelte, `rootChildren` is evaluated. Let's see if Object.keys or something is weird.
    console.log("Array.isArray?", Array.isArray(rootChildren));
    console.log("length:", rootChildren.length);
    console.log("rootChildren:", typeof rootChildren);

    // let's try to destructure or spread
    console.log("spread:", [...rootChildren].map(x => x.text));
}

simulateSvelte(pageItem);
