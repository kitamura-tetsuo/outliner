import { expect, type Page } from "@playwright/test";

/** Inspect independent definitions and their actual Page/Layout placement tree. */
export async function readIndependentViews(page: Page) {
    return page.evaluate(() => {
        const project = (globalThis as any).__YJS_STORE__.yjsClient.getProject();
        const walk = (items: any): any[] =>
            Array.from(items, (item: any) => ({
                id: item.id,
                gridId: item.yjsGridId,
                kanbanId: item.kanbanId,
                children: walk(item.items),
            }));
        return {
            grids: project.ydoc.getMap("yjsGrids").toJSON(),
            kanbans: project.ydoc.getMap("yjsKanbans").toJSON(),
            placements: walk(project.items),
        };
    });
}

export async function confirmSqlOnlyTableDeletion(page: Page, dependencyCount = 2) {
    const dialog = page.getByRole("dialog", { name: /Delete table/ });
    await expect(dialog).toContainText("Grids reading this table (1)");
    if (dependencyCount > 1) await expect(dialog).toContainText("Kanbans reading this table (1)");
    await expect(dialog).toContainText("survive");
    await dialog.getByRole("button", { name: "Delete table and keep references", exact: true }).click();
    await expect(dialog).toHaveCount(0);
}
