import "../utils/registerAfterEachSnapshot";
import { expect, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/** @feature DMO-6f2ad91c
 *  Title   : Demo page rename keeps its route
 *  Source  : docs/client-features.yaml
 *
 * Renaming the page that is open in a public demo project keeps that page
 * open and moves the route to the new title. It must never fall into the demo
 * route's "Page not found" state, which is what happened while the rename and
 * the route-driven page lookup raced each other.
 */

const NOT_FOUND = "Page not found";

/** A page nobody else owns, so the shared demo content stays untouched. */
function uniqueTitle(prefix: string): string {
    return `${prefix} ${Date.now()}`;
}

async function createDemoPage(page: Page, demoProject: string, title: string): Promise<void> {
    await page.goto(`/${demoProject}/${encodeURIComponent(title)}`);

    // The missing-page path is the one that creates it.
    await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Create Page" }).click();

    await expect(page.locator(".outliner-item.page-title")).toContainText(title, { timeout: 30000 });
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
}

/** Put the cursor at the end of the page title, ready to type. */
async function focusTitleEnd(page: Page): Promise<void> {
    await page.locator(".outliner-item.page-title[data-item-id] .item-content").click({ force: true });
    await TestHelpers.waitForCursorVisible(page);
    await page.waitForSelector("textarea.global-textarea:focus");
    await page.keyboard.press("End");
}

async function expectRouteFor(page: Page, demoProject: string, title: string): Promise<void> {
    await expect(async () => {
        const pathname = new URL(page.url()).pathname;
        expect(decodeURIComponent(pathname)).toBe(`/${demoProject}/${title}`);
        // The route builder encodes the title; nothing writes a raw segment.
        expect(pathname).toBe(`/${demoProject}/${encodeURIComponent(title)}`);
    }).toPass({ timeout: 15000 });
}

test.describe("DMO-6f2ad91c: renaming the open demo page", () => {
    test("moves the route to the new title and keeps the page open", async ({ page }) => {
        const original = uniqueTitle("Rename Demo");
        await createDemoPage(page, "demo", original);

        await focusTitleEnd(page);
        await page.keyboard.type(" Renamed");

        const renamed = `${original} Renamed`;
        await expectRouteFor(page, "demo", renamed);
        await expect(page.locator(".outliner-item.page-title")).toContainText(renamed);
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);

        // The page was never torn down: the caret survived the route change, so
        // typing continues in the same title without touching it again.
        await page.keyboard.type("!");
        const renamedAgain = `${renamed}!`;
        await expectRouteFor(page, "demo", renamedAgain);
        await expect(page.locator(".outliner-item.page-title")).toContainText(renamedAgain);
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);

        // The renamed URL is a real address: it resolves on a fresh load too.
        await page.reload();
        await expect(page.locator(".outliner-item.page-title")).toContainText(renamedAgain, { timeout: 30000 });
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    });

    test("encodes a Japanese rename in the Japanese demo route", async ({ page }) => {
        const original = uniqueTitle("改名デモ");
        await createDemoPage(page, "demo-ja", original);

        await focusTitleEnd(page);
        await page.keyboard.insertText("・更新");

        const renamed = `${original}・更新`;
        await expectRouteFor(page, "demo-ja", renamed);
        await expect(page.locator(".outliner-item.page-title")).toContainText(renamed);
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);

        await page.reload();
        await expect(page.locator(".outliner-item.page-title")).toContainText(renamed, { timeout: 30000 });
        await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    });

    test("still reports a demo page that genuinely does not exist", async ({ page }) => {
        const missing = uniqueTitle("Missing Demo Page");
        await page.goto(`/demo/${encodeURIComponent(missing)}`);

        await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole("button", { name: "Create Page" })).toBeVisible();
        // The missing name stays in the URL; nothing pulls the route elsewhere.
        expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/demo/${missing}`);
    });
});
