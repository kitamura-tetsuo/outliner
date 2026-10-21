import { expect, type Page } from "@playwright/test";
import { TestHelpers } from "./testHelpers";

export async function openKanbanSetup(page: Page, itemId: string, mouse = false) {
    await TestHelpers.setCursor(page, itemId, 0);
    await TestHelpers.focusGlobalTextarea(page);
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.type("/kanban");
    const command = page.getByTestId("command-item-kanban");
    await expect(command).toBeVisible();
    if (mouse) await command.click();
    else await page.keyboard.press("Enter");
    const panel = page.getByTestId("kanban-create-panel").last();
    await expect(panel).toBeVisible();
    return panel;
}

export async function readSlashState(page: Page) {
    return page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const entries = (name: string) =>
            [...project.ydoc.getMap(name).entries()].map(([id, entry]: any) => ({ id, value: entry.toJSON() }));
        const placements = [...(globalThis as any).generalStore.currentPage.items].map((item: any) => ({
            id: item.id,
            text: String(item.text),
            kind: item.componentType,
            kanbanId: item.tree.getNodeValueFromKey(item.key).get("kanbanId"),
        }));
        const tables = [...project.ydoc.getMap("yjsTables").entries()].map(([id, entry]: any) => ({
            id,
            value: {
                name: entry.get("name"),
                sqlName: entry.get("sqlName"),
                docId: entry.get("doc").guid,
                schema: entry.get("doc").getText("schema").toString(),
                data: entry.get("doc").getMap("data").toJSON(),
            },
        }));
        return { tables, grids: entries("yjsGrids"), boards: entries("yjsKanbans"), placements };
    });
}
