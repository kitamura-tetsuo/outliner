import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// Shift+right-click must yield to the browser's native context menu (#5407):
// no application menu opens and the native `contextmenu` default action is
// left uncancelled. Uses real browser pointer input and observes the event's
// final `defaultPrevented` after the full application dispatch completed.
test.describe("Shift+right-click native context menu escape", () => {
    test("Shift+right-click opens no app menu and leaves the native action uncancelled", async ({ page }, testInfo) => {
        test.setTimeout(120000);

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Escape item 1",
            "Escape item 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 2);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(firstItemId).not.toBeNull();
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        // Capture-phase listener: application handlers stop propagation, so a
        // bubble listener would never fire. The stored event object is live:
        // reading `defaultPrevented` from it later yields the final value
        // after the full application dispatch completed.
        await page.evaluate(() => {
            (window as unknown as { __lastContextMenuEvent: Event | null; }).__lastContextMenuEvent = null;
            window.addEventListener(
                "contextmenu",
                (event) => {
                    (window as unknown as { __lastContextMenuEvent: Event; }).__lastContextMenuEvent = event;
                },
                true,
            );
        });
        const lastContextMenu = () =>
            page.evaluate(() => {
                const event =
                    (window as unknown as { __lastContextMenuEvent: MouseEvent | null; }).__lastContextMenuEvent;
                return event ? { defaultPrevented: event.defaultPrevented, shiftKey: event.shiftKey } : null;
            });

        // Positive control: ordinary right-click opens the item menu and cancels native.
        await firstItem.click({ button: "right" });
        await expect(page.locator(".context-menu")).toBeVisible();
        expect(await lastContextMenu()).toEqual({ defaultPrevented: true, shiftKey: false });
        await page.keyboard.press("Escape");
        await expect(page.locator(".context-menu")).toBeHidden();

        // Shift+right-click: no application menu, native action uncancelled.
        await firstItem.click({ button: "right", modifiers: ["Shift"] });
        await expect(page.locator(".context-menu")).toBeHidden();
        expect(await lastContextMenu()).toEqual({ defaultPrevented: false, shiftKey: true });
        await TestHelpers.waitForOutlinerItems(page, 2);
    });

    test("Shift+right-click dismisses an open app menu without running a command", async ({ page }, testInfo) => {
        test.setTimeout(120000);

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "Escape item 1",
            "Escape item 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 2);

        const firstItemId = await TestHelpers.getItemIdByIndex(page, 1);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);

        await page.evaluate(() => {
            (window as unknown as { __lastContextMenuEvent: Event | null; }).__lastContextMenuEvent = null;
            window.addEventListener(
                "contextmenu",
                (event) => {
                    (window as unknown as { __lastContextMenuEvent: Event; }).__lastContextMenuEvent = event;
                },
                true,
            );
        });
        const lastContextMenu = () =>
            page.evaluate(() => {
                const event =
                    (window as unknown as { __lastContextMenuEvent: MouseEvent | null; }).__lastContextMenuEvent;
                return event ? { defaultPrevented: event.defaultPrevented, shiftKey: event.shiftKey } : null;
            });

        await firstItem.click({ button: "right" });
        await expect(page.locator(".context-menu")).toBeVisible();

        // Click a viewport point that actually lands on the menu backdrop: the
        // overlay spans the viewport, but chrome above it (e.g. the toolbar)
        // can cover corners, so verify with elementFromPoint first.
        // (`mouse.click` takes no `modifiers`, so Shift is held explicitly.)
        const backdropPoint = await page.evaluate(() => {
            const overlay = document.querySelector(".context-menu-overlay");
            const panel = document.querySelector(".context-menu");
            if (!overlay) return null;
            const candidates = [
                { x: window.innerWidth - 20, y: window.innerHeight - 20 },
                { x: window.innerWidth - 20, y: Math.floor(window.innerHeight / 2) },
                { x: 20, y: window.innerHeight - 20 },
            ];
            return candidates.find((candidate) => {
                const hit = document.elementFromPoint(candidate.x, candidate.y);
                return !!hit && (hit === overlay || overlay.contains(hit)) && !(panel?.contains(hit));
            }) ?? null;
        });
        expect(backdropPoint).not.toBeNull();
        await page.keyboard.down("Shift");
        await page.mouse.click(backdropPoint!.x, backdropPoint!.y, { button: "right" });
        await page.keyboard.up("Shift");
        await expect(page.locator(".context-menu")).toBeHidden();
        expect(await lastContextMenu()).toEqual({ defaultPrevented: false, shiftKey: true });

        // No menu command ran and no stale bypass remains: the items are
        // untouched and the next ordinary right-click reopens the menu.
        await TestHelpers.waitForOutlinerItems(page, 2);
        await firstItem.click({ button: "right" });
        await expect(page.locator(".context-menu")).toBeVisible();
    });
});
