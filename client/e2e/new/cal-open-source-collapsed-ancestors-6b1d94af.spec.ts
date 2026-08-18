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

test.describe("FTR-6b1d94af: collapsed ancestors", () => {
    test("expands the collapsed branch the source sits under, then focuses it", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor", "Quarter"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        const keys = await page.evaluate(() => {
            const items = [...(globalThis as any).generalStore.currentPage.items];
            const quarter = items.find((i: any) => i.text === "Quarter");
            const buried = quarter.items.addNode("tester");
            buried.updateText("Buried task");
            const local = new Date();
            local.setHours(11, 0, 0, 0);
            buried.start = local.toISOString();
            buried.allDay = false;
            buried.duration = "PT45M";
            return {
                anchor: items.find((i: any) => i.text === "Calendar anchor").key as string,
                quarter: quarter.key as string,
                buried: buried.key as string,
            };
        });

        const buriedItem = page.locator(`.outliner-item[data-item-id="${keys.buried}"]`);
        await expect(buriedItem).toBeVisible({ timeout: 10000 });

        // Collapse the parent through the outline's own affordance, so the
        // target really is hidden before the calendar is built.
        await page.locator(`.outliner-item[data-item-id="${keys.quarter}"] .collapse-btn`).click();
        await expect(buriedItem).toHaveCount(0, { timeout: 10000 });

        await createCalendarOnItem(page, keys.anchor, "Collapsed Calendar");

        const entry = entryFor(page, keys.buried);
        await expect(entry).toBeVisible({ timeout: 15000 });
        await entry.dblclick();

        // Navigation expanded the branch rather than silently focusing an
        // element nobody can see.
        await expect(buriedItem).toBeVisible({ timeout: 20000 });
        await expect(buriedItem).toHaveAttribute("data-active", "true", { timeout: 20000 });
    });
});
