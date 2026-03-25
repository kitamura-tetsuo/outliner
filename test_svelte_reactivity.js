import { render } from "svelte/server";
import PageListItem from "./client/src/components/PageListItem.svelte";
import { Project } from "./client/src/schema/app-schema.ts";

const project = Project.createInstance("Test Project");
const page = project.addPage("Test Page", "user");

const child1 = page.items.addNode("user");
child1.text = "This is child 1";

const child2 = page.items.addNode("user");
child2.text = "This is child 2";

try {
    const result = render(PageListItem, { props: { page, isGridView: true, onSelect: () => {} } });
    console.log(result.html);
} catch (e) {
    console.error(e);
}
