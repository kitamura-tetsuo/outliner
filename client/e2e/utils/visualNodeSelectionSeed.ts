import { expect, type Page, type TestInfo } from "@playwright/test";
import { TestHelpers } from "./testHelpers";

/** The two Text items every #5024 selection spec drags between. */
export const SELECTION_TEXTS = ["Alpha text", "Omega text"];

/** Seed a page holding just those two Text items and wait for them to render. */
export async function seedSelectionPage(page: Page, testInfo: TestInfo): Promise<void> {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, SELECTION_TEXTS);
    for (const line of SELECTION_TEXTS) {
        await expect(page.locator(".outliner-item[data-item-id]").filter({ hasText: line }).first())
            .toBeVisible({ timeout: 15000 });
    }
}

/** Resolve a seeded item's id from its text, so later steps address it by `data-item-id`. */
export async function itemIdByText(page: Page, text: string): Promise<string> {
    const item = page.locator(".outliner-item[data-item-id]").filter({ hasText: text }).first();
    await expect(item).toBeVisible({ timeout: 15000 });
    const id = await item.getAttribute("data-item-id");
    expect(id, `no rendered item for "${text}"`).toBeTruthy();
    return id!;
}
