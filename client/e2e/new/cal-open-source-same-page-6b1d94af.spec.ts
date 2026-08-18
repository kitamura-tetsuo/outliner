import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-6b1d94af
 *  Title   : Open a calendar event's source outline item on double-click
 *  Source  : docs/client-features/cal-open-source-item-6b1d94af.yaml
 */
import { expect, test } from "@playwright/test";
import { createCalendarOnItem, entryFor } from "../utils/calendarSourceHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-6b1d94af: same-page source navigation", () => {
    test("double-clicking an entry focuses its source item without leaving the page", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Standup"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        const keys = await page.evaluate(() => {
            const items = [...(globalThis as any).generalStore.currentPage.items];
            const standup = items.find((i: any) => i.text === "Standup");
            const local = new Date();
            local.setHours(9, 0, 0, 0);
            standup.start = local.toISOString();
            standup.allDay = false;
            standup.duration = "PT30M";
            return {
                anchor: items.find((i: any) => i.text === "Calendar anchor").key as string,
                standup: standup.key as string,
            };
        });

        await createCalendarOnItem(page, keys.anchor, "Same Page Calendar");

        const urlBefore = page.url();
        const entry = entryFor(page, keys.standup);
        await expect(entry).toBeVisible({ timeout: 15000 });
        await expect(entry).toHaveAttribute("data-navigable", "true");

        // A single click leaves the source item untouched: only a double-click
        // navigates.
        await entry.click();
        await page.waitForTimeout(300);
        await expect(page.locator(`.outliner-item[data-item-id="${keys.standup}"]`))
            .toHaveAttribute("data-active", "false");

        await entry.dblclick();

        // The source is on the page already, so nothing routes...
        await expect(page).toHaveURL(urlBefore);
        // ...and the exact source item takes the caret.
        await expect(page.locator(`.outliner-item[data-item-id="${keys.standup}"]`))
            .toHaveAttribute("data-active", "true", { timeout: 15000 });
    });
});
