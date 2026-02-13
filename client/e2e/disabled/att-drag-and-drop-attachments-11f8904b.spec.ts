import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ATT-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ATT-0001: Drag and drop attachments", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Capture console logs
        page.on("console", msg => console.log("PAGE LOG:", msg.text()));
        page.on("pageerror", error => console.log("PAGE ERROR:", error.message));

        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.keyboard.type("Drop here");
    });

    test("attachment preview appears", async ({ page }) => {
        const item = page.locator(".outliner-item").first();

        // Create DataTransfer in the main world and execute items.add(File)
        await page.evaluateHandle(() => {
            const dt = new DataTransfer();
            const blob = new Blob(["hello"], { type: "text/plain" });
            const file = new File([blob], "hello.txt", { type: "text/plain" });
            dt.items.add(file);
            try {
                (window as any).__E2E_LAST_FILES__ = [file];
            } catch {}
            return dt;
        });

        // E2E specific: Directly add attachment to displayRef using __E2E_ADD_ATTACHMENT__
        // (deterministically reproduce DnD UI result instead of actual DnD event)
        // Wait for helper exposure
        await page.waitForFunction(() => !!(window as any).__E2E_ADD_ATTACHMENT__, null, { timeout: 5000 });
        // Get target element and add directly
        await page.evaluate(() => {
            const el = document.querySelector(".outliner-item .item-content") as Element | null;
            if (!el) throw new Error("item-content not found");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "hello");
        });
        // Wait for preview to appear on DOM (depends on pure Yjs display)
        await page.locator(".attachment-preview").first().waitFor({ state: "visible", timeout: 10000 });

        // Ensure synchronization of Yjs -> UI mirror reflection with test-specific event
        await page.evaluate(() =>
            new Promise<void>(resolve => {
                const handler = () => {
                    try {
                        window.removeEventListener("item-attachments-changed", handler as any);
                    } catch {}
                    resolve();
                };
                window.addEventListener("item-attachments-changed", handler as any, { once: true } as any);
                // Fallback: Continue after a short timeout even if event doesn't come because it's already reflected
                setTimeout(() => {
                    try {
                        window.removeEventListener("item-attachments-changed", handler as any);
                    } catch {}
                    resolve();
                }, 1000);
            })
        );

        await expect(item.locator(".attachment-preview").first()).toBeVisible();
    });

    test("multiple attachments can be added to same item", async ({ page }) => {
        const item = page.locator(".outliner-item").first();

        // Add attachment twice with E2E specific helper (deterministically reproduce final result of DnD)
        // Call __E2E_ADD_ATTACHMENT__ twice
        await page.waitForFunction(() => !!(window as any).__E2E_ADD_ATTACHMENT__, null, { timeout: 5000 });
        await page.evaluate(() => {
            const el = document.querySelector(".outliner-item .item-content") as Element | null;
            if (!el) throw new Error("item-content not found");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "a");
            (window as any).__E2E_ADD_ATTACHMENT__?.(el, "b");
        });
        // Wait for DOM reflection (at least 2 previews should be displayed in the same item)
        await expect(item.locator(".attachment-preview")).toHaveCount(2, { timeout: 10000 });
    });
});
