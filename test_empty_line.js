import { Project } from "./client/src/schema/app-schema.ts";

const project = Project.createInstance("Test Project");
const page = project.addPage("Test Page", "user");

const child1 = page.items.addNode("user");
child1.text = "This is child 1";

const child2 = page.items.addNode("user");
child2.text = "This is child 2";

const len = page.items.length;
console.log("Length:", len);

for(let i=0; i<len; i++) {
  console.log("item", i, "id:", page.items.at(i)?.id);
}

