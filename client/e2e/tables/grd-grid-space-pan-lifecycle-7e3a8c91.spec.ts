/** @feature GRD-7e3a8c91 */
import { expect, test } from "@playwright/test";
import { keyboardTaskRow, prepareKeyboardGrid, selectAndFocusCell } from "../utils/gridKeyboardFixture";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Grid Space pan ownership lifecycle (#5863)", () => {
    let firstRowId: string;
    let secondRowId: string;

    test.beforeEach(async ({ page }, testInfo) => {
        [firstRowId, secondRowId] = await prepareKeyboardGrid(page, testInfo);
        const view = page.getByTestId("yjs-table-view");
        for (const column of ["id", "title", "status", "priority", "due_date", "repeat_days"]) {
            await view.getByTestId(`yjs-table-width-${column}`).fill("300");
            await view.getByTestId(`yjs-table-width-${column}`).press("Enter");
        }
    });

    test("focus entering a native cell control terminates movement", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const title = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const status = keyboardTaskRow(page, firstRowId).locator("td[data-col='status'] select");
        await selectAndFocusCell(title);
        const box = (await title.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 60, y, { steps: 2 });
        await page.keyboard.press("Tab");
        await expect(status).toBeFocused();
        await expect(grid).not.toHaveClass(/pan-active/);
        const stoppedAt = await grid.evaluate(element => element.scrollLeft);
        await page.mouse.move(x - 140, y, { steps: 3 });
        expect(await grid.evaluate(element => element.scrollLeft)).toBe(stoppedAt);
        await page.mouse.up();
        await page.keyboard.up("Space");

        await status.selectOption("done");
        await expect(status).toHaveValue("done");
    });

    test("an unrelated pen sequence cannot discard the mouse release guard", async ({ page }) => {
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        const next = keyboardTaskRow(page, secondRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 40, y);
        await page.keyboard.up("Space");

        const nextBox = (await next.boundingBox())!;
        const penX = nextBox.x + nextBox.width / 2;
        const penY = nextBox.y + nextBox.height / 2;
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: penX,
            y: penY,
            button: "left",
            buttons: 1,
            clickCount: 1,
            pointerType: "pen",
        });
        await cdp.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: penX,
            y: penY,
            button: "left",
            buttons: 0,
            clickCount: 1,
            pointerType: "pen",
        });
        await cdp.detach();
        await expect(next.locator("input")).toBeFocused();

        await page.mouse.up();
        await expect(origin.locator("input")).toHaveCount(0);
        await expect(next.locator("input")).toBeFocused();
    });

    test("owning Grid unmount makes queued owner input inert", async ({ page }) => {
        const grid = page.getByTestId("yjs-table-grid");
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.evaluate(() => {
            (globalThis as typeof globalThis & { __panUnmountOwner?: HTMLElement; }).__panUnmountOwner = document
                .querySelector<HTMLElement>("[data-testid='yjs-table-grid']")!;
        });
        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 50, y, { steps: 2 });

        // Use the production Svelte-managed project link to unmount the owner
        // without synthesizing a terminal pointer event for its held sequence.
        await page.getByTestId("toolbar-project-name").evaluate((link: HTMLElement) => link.click());
        await expect(grid).toHaveCount(0);
        const stoppedAt = await page.evaluate(() => {
            const owner = (globalThis as typeof globalThis & { __panUnmountOwner: HTMLElement; }).__panUnmountOwner;
            if (owner.isConnected) throw new Error("Pan owner remained mounted");
            return owner.scrollLeft;
        });

        await page.mouse.move(x - 150, y, { steps: 3 });
        await page.mouse.up();
        await page.keyboard.up("Space");
        expect(
            await page.evaluate(() =>
                (globalThis as typeof globalThis & { __panUnmountOwner: HTMLElement; }).__panUnmountOwner.scrollLeft
            ),
        ).toBe(stoppedAt);
    });

    test("an off-document release cannot consume the next outside-Grid click", async ({ page, context }) => {
        const origin = keyboardTaskRow(page, firstRowId).locator("td[data-col='title']");
        await selectAndFocusCell(origin);
        const box = (await origin.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.keyboard.down("Space");
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - 40, y);

        // Moving to another real document blurs this Grid. The release occurs
        // there, so the original document cannot observe its pointerup.
        const other = await context.newPage();
        await other.setContent("<button>other document</button>");
        await other.bringToFront();
        await other.mouse.move(10, 10);
        await other.mouse.up();
        await other.close();
        await page.bringToFront();
        await page.keyboard.up("Space");

        // A fresh right-button sequence also authoritatively supersedes the
        // obsolete guard even though pan admission itself remains left-only.
        const textItem = page.locator(".outliner-item:not(.page-title)[data-item-id]", { hasText: "Keyboard grid" });
        await expect(textItem).toHaveAttribute("role", "treeitem");
        await expect(textItem).toHaveCount(1);
        const textItemContent = textItem.locator(".item-content");
        await textItemContent.click({ button: "right" });
        await expect(page.locator(".context-menu")).toBeVisible();
        await page.keyboard.press("Escape");

        // The following independent left-button action remains usable too.
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        await expect(page.getByTestId("yjs-table-create-panel")).toBeVisible();
    });
});
