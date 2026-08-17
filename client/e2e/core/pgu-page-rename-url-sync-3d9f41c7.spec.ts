import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature PGU-3d9f41c7
 *  Title   : Page rename keeps the URL in sync
 *  Source  : docs/client-features.yaml
 */
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

const ORIGINAL_TITLE = "Old Title";

/** Rename the open page by typing `prefix` at the start of its title. */
async function renameByTyping(page: Page, prefix: string): Promise<void> {
    const titleItem = page.locator(".outliner-item.page-title[data-item-id]").first();
    await expect(titleItem).toBeVisible({ timeout: 30000 });
    const itemId = await titleItem.getAttribute("data-item-id");
    if (!itemId) throw new Error("page title item has no data-item-id");

    await TestHelpers.setCursor(page, itemId, 0);
    await page.waitForTimeout(500);
    await TestHelpers.insertText(page, itemId, prefix);
    await page.waitForTimeout(500);
}

/** The decoded path the URL is expected to settle on. */
function expectedPath(projectName: string, title: string): string {
    return `/${projectName}/${title}`;
}

test.describe("PGU-3d9f41c7: Renaming a page keeps its URL in sync", () => {
    test("URL follows the renamed title while the page stays mounted", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            ["First body line"],
            undefined,
            { pageName: ORIGINAL_TITLE },
        );
        await TestHelpers.waitForAppReady(page);
        await TestHelpers.waitForOutlinerItems(page, 2, 30000);

        // "Page not found" must never appear, not even for a frame.
        const notFoundSeen = page.evaluate(() =>
            new Promise<boolean>((resolve) => {
                const seen = () => document.body.innerText.includes("Page not found");
                if (seen()) return resolve(true);
                const observer = new MutationObserver(() => {
                    if (seen()) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                setTimeout(() => {
                    observer.disconnect();
                    resolve(false);
                }, 12000);
            })
        );

        await renameByTyping(page, "Renamed ");
        const newTitle = `Renamed ${ORIGINAL_TITLE}`;

        await expect(async () => {
            expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(expectedPath(projectName, newTitle));
        }).toPass({ timeout: 15000 });

        // The edited page stays mounted, keeping its title and its content.
        await expect(page.locator(".outliner-item.page-title")).toContainText(newTitle);
        await expect(
            page.locator(".outliner-item[data-item-id] .item-text").filter({ hasText: "First body line" }).first(),
        ).toBeVisible();
        expect(await notFoundSeen).toBe(false);

        // The renamed URL is a real, reloadable location.
        await page.reload();
        await TestHelpers.waitForAppReady(page);
        await expect(page.locator(".outliner-item.page-title")).toContainText(newTitle, { timeout: 30000 });
        await expect(page.getByText("Page not found")).toHaveCount(0);
    });

    test("Non-ASCII and URL-sensitive titles are encoded exactly once", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            ["First body line"],
            undefined,
            { pageName: ORIGINAL_TITLE },
        );
        await TestHelpers.waitForAppReady(page);
        await TestHelpers.waitForOutlinerItems(page, 2, 30000);

        const prefix = "日本語 50% #tag ";
        await renameByTyping(page, prefix);
        const newTitle = `${prefix}${ORIGINAL_TITLE}`;

        await expect(async () => {
            expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(expectedPath(projectName, newTitle));
        }).toPass({ timeout: 15000 });

        // Encoded exactly once: decoding the raw path twice would differ.
        expect(new URL(page.url()).pathname).toBe(
            `/${encodeURIComponent(projectName)}/${encodeURIComponent(newTitle)}`,
        );
        await expect(page.getByText("Page not found")).toHaveCount(0);

        await page.reload();
        await TestHelpers.waitForAppReady(page);
        await expect(page.locator(".outliner-item.page-title")).toContainText(newTitle, { timeout: 30000 });
        await expect(page.getByText("Page not found")).toHaveCount(0);
    });

    test("A genuinely missing page still reports Page not found", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
            ["First body line"],
            undefined,
            { pageName: ORIGINAL_TITLE },
        );
        await TestHelpers.waitForAppReady(page);
        await TestHelpers.waitForOutlinerItems(page, 2, 30000);

        await page.goto(`/${encodeURIComponent(projectName)}/${encodeURIComponent("No Such Page")}?isTest=true`);
        await expect(page.getByText("Page not found")).toBeVisible({ timeout: 60000 });
    });
});
