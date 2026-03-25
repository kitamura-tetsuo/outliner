import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";
import PageListItem from "./client/src/components/PageListItem.svelte";
import { Project } from "./client/src/schema/app-schema.ts";

test("PageListItem renders content test with tick", async () => {
    const project = Project.createInstance("Test Project");
    const page = project.addPage("Test Page", "user");

    const child1 = page.items.addNode("user");
    child1.text = "This is child 1";

    const child2 = page.items.addNode("user");
    child2.text = "This is child 2";

    const { container } = render(PageListItem as any, { props: { page, isGridView: true, onSelect: () => {} } });

    // We need to wait for tick or just check innerHTML directly because it updates on mount
    await new Promise(r => setTimeout(r, 100));

    console.log(container.innerHTML);
    expect(container.innerHTML).toContain("This is child 1");
    expect(container.innerHTML).not.toContain("No content");
});
