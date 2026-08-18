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

/** Non-ASCII plus a character the route helper has to percent-encode. */
const OTHER_PAGE_TITLE = "設計メモ & plans";

test.describe("FTR-6b1d94af: cross-page source navigation", () => {
    test(
        "routes to the owning page — non-ASCII title included — and focuses the source item",
        async ({ page }, testInfo) => {
            test.setTimeout(120000);
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar anchor"]);
            await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

            // The source lives on a *different* page of the same project, created
            // through the schema rather than the UI (AGENTS.md §2).
            const keys = await page.evaluate((otherTitle) => {
                const store = (globalThis as any).generalStore;
                const anchor = [...store.currentPage.items].find((i: any) => i.text === "Calendar anchor");
                const otherPage = store.project.addPage(otherTitle, "tester");
                const review = otherPage.items.addNode("tester");
                review.updateText("Design review");
                const local = new Date();
                local.setHours(14, 0, 0, 0);
                review.start = local.toISOString();
                review.allDay = false;
                review.duration = "PT1H";
                return { anchor: anchor.key as string, review: review.key as string };
            }, OTHER_PAGE_TITLE);

            await createCalendarOnItem(page, keys.anchor, "Cross Page Calendar");

            const entry = entryFor(page, keys.review);
            await expect(entry).toBeVisible({ timeout: 15000 });
            await expect(entry).toHaveAttribute("data-navigable", "true");

            await entry.dblclick();

            // The URL is the canonical project/page route. The last segment is
            // compared decoded, so the assertion holds however the browser
            // chooses to display the percent-encoding the route helper produced.
            await expect(page).toHaveURL(
                (url) => decodeURIComponent(url.pathname.split("/").pop() ?? "") === OTHER_PAGE_TITLE,
                { timeout: 20000 },
            );
            await expect(page.locator(`.outliner-item[data-item-id="${keys.review}"]`))
                .toHaveAttribute("data-active", "true", { timeout: 20000 });
        },
    );
});
