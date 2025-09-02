import { expect, test } from "@playwright/test";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { yjsService } from "../../src/lib/yjs/service";
import { Items } from "../../src/schema/yjs-schema";
import { TestHelpers } from "../utils/testHelpers";

test("yjs service basic operations", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
    const project = yjsService.createProject("e2e");

    const first = yjsService.addItem(project, "root", "u1");
    yjsService.updateText(project, first.key, "A");
    const second = yjsService.addItem(project, "root", "u1");
    yjsService.updateText(project, second.key, "B");

    yjsService.reorderItem(project, second.key, 0);
    expect(project.items.at(0)?.id).toBe(second.id);

    yjsService.indentItem(project, second.key);
    const children = new Items(project.ydoc, project.tree, first.key);
    expect(children.length).toBe(1);
    yjsService.outdentItem(project, second.key);
    expect(project.items.length).toBe(2);

    yjsService.removeItem(project, first.key);
    expect(project.items.length).toBe(1);

    const awareness = new Awareness(new Y.Doc());
    yjsService.setPresence(awareness, { cursor: { itemId: second.key, offset: 1 } });
    expect(yjsService.getPresence(awareness)?.cursor.itemId).toBe(second.key);
});
