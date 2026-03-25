import { Project } from "./client/src/schema/app-schema.ts";

const project = Project.createInstance("Test Project");
const page = project.addPage("Test Page", "user");

const child1 = page.items.addNode("user");
child1.text = "This is child 1";

const child2 = page.items.addNode("user");
child2.text = "This is child 2";

console.log(page.items);
console.log(Symbol.iterator in page.items);

