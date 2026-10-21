import { expect, type Page, type TestInfo } from "@playwright/test";
import {
    addSourceRecord,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "./crossProjectGridHelpers";
import { createBlockFromItem } from "./nodeKindHelpers";

export async function transferHistory(page: Page) {
    return page.evaluate(async () => {
        const g = globalThis as any;
        const project = g.generalStore.project;
        const path = "/src/services/calendar/calendarService.ts";
        const { ensureCalendarUndoManager } = await import(/* @vite-ignore */ path);
        const calendar = ensureCalendarUndoManager(project);
        const placements: { pageId: string; itemId: string; itemKey: string; kind: string; objectId: string; }[] = [];
        const walk = (item: any, pageId: string) => {
            const value = project.tree.getNodeValueFromKey(item.key);
            if (value?.get("componentType") === "yjstable" || value?.get("componentType") === "calendar") {
                placements.push({
                    pageId,
                    itemId: item.id,
                    itemKey: item.key,
                    kind: value.get("componentType"),
                    objectId: value.get("yjsGridId") ?? value.get("calendarId"),
                });
            }
            for (const child of item.items) walk(child, pageId);
        };
        for (const page of project.items) walk(page, page.id);
        return {
            calendars: project.calendars.toJSON(),
            placements,
            tree: project.ydoc.getMap("orderedTree").toJSON(),
            positions: [
                g.globalUndoRouter.undoDepth,
                g.globalUndoRouter.redoDepth,
                g.generalStore.undoManager.undoStack.length,
                g.generalStore.undoManager.redoStack.length,
                calendar.undoStack.length,
                calendar.redoStack.length,
            ],
        };
    });
}

export async function mixedTransfer(page: Page, info: TestInfo) {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const fixture = await seedCrossProjectFixture(page, info);
    await createBlankGrid(page, "Owned", "owned");
    await addSourceRecord(page);
    await createBlockFromItem(page, page.locator(".outliner-item[data-item-id]").nth(2), "Calendar");
    await page.getByTestId("calendar-name-input").fill("Owned Calendar");
    await page.getByTestId("calendar-create").click();
    await expect(page.getByTestId("calendar-view")).toHaveCount(1);
    await page.evaluate(() => {
        const calendar = [...(globalThis as any).generalStore.project.calendars.values()][0] as any;
        calendar.set("query", "SELECT id AS id FROM owned");
        calendar.set("timezone", "Asia/Tokyo");
        calendar.set("weekStart", 1);
        calendar.set("laneOrder", ["id"]);
        calendar.set("workingHoursStartMinutes", 600);
    });
    const sourceObjects = await readGridProjectState(page);
    await copyGridHosts(page);
    await openProjectPage(page, fixture, "destination");
    await createBlankGrid(page, "Keep", "keep_records");
    await addSourceRecord(page);
    const before = await transferHistory(page);
    await pasteAtAnchor(page, 2);
    await expect(page.getByTestId("calendar-view")).toHaveCount(1);
    const after = await transferHistory(page);
    expect(after.positions).toEqual([
        before.positions[0] + 1,
        0,
        before.positions[2] + 1,
        0,
        ...before.positions.slice(4),
    ]);
    const id = Object.keys(after.calendars)[0];
    const objects = await readGridProjectState(page);
    return { fixture, id, before, after, objects, sourceObjects };
}
