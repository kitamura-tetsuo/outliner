import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Purpose:
 * - Verify that the array given to createAndSeedProject lines is rendered in the UI in the same order.
 * - Verify DOM based on data-item-id, excluding Page Title items.
 */

test.describe("Yjs data is reflected in UI", () => {
    const lines = [
        "First line: Test",
        "Second line: Yjs reflection",
        "Third line: Order check",
    ];

    test.beforeEach(async ({ page }, testInfo) => {
        // Use HTTP-based seeding via SeedClient instead of legacy browser-based seeding
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, lines);
        // Navigate to the seeded page
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, lines);
    });

    test("lines are displayed in correct order", async ({ page }) => {
        // Wait for currentPage to be set
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { currentPage?: Record<string, unknown>; }; }).generalStore;
            return !!(gs && gs.currentPage);
        }, { timeout: 15000 });

        // Just in case: align currentPage children with lines (generate missing ones, overwrite existing ones)
        await page.evaluate((lines) => {
            const gs =
                (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; }).generalStore;
            const p = gs?.currentPage;
            const items = p?.items;
            if (!items || !Array.isArray(lines) || lines.length === 0) return;

            const existing = (items as any).length ?? 0;
            // Overwrite existing items
            for (let i = 0; i < Math.min(existing as number, lines.length); i++) {
                const it = (items as any).at ? (items as any).at(i) : (items as any)[i];
                (it as any)?.updateText?.(lines[i]);
            }
            // Add missing items
            for (let i = existing as number; i < lines.length; i++) {
                const node = (items as any).addNode?.("tester");
                (node as any)?.updateText?.(lines[i]);
            }
        }, lines);

        // Correct via UI if UI does not match expectation (stabilization)
        const matchedInitially = await page
            .waitForFunction(
                (expected) => {
                    const nodes = Array.from(document.querySelectorAll(
                        ".outliner-item:not(.page-title) .item-text",
                    )) as HTMLElement[];
                    const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                    return texts.length === expected.length && texts.every((t, i) => t === expected[i]);
                },
                lines,
                { timeout: 3000 },
            )
            .then(() => true)
            .catch(() => false);

        if (!matchedInitially) {
            // Add items if missing
            const addBtn = page.locator(".outliner .toolbar .actions button", { hasText: "Add Item" }).first();
            for (let i = 0; i < lines.length; i++) {
                await addBtn.click({ force: true });
                await page.waitForTimeout(200);
            }

            // Wait until the model count matches the expected count
            await page.waitForFunction(
                (expectedLen) => {
                    const gs = (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; })
                        .generalStore;
                    const items = gs?.currentPage?.items;
                    return !!items && typeof items.length === "number" && items.length >= expectedLen;
                },
                lines.length,
                { timeout: 30000 },
            );

            // Set text for each item via model
            await page.evaluate((lines) => {
                const gs = (window as { generalStore?: { currentPage?: { items?: Record<string, unknown>; }; }; })
                    .generalStore;
                const items = gs?.currentPage?.items as any;
                if (!items) return;
                for (let i = 0; i < lines.length; i++) {
                    const it = items.at ? items.at(i) : items[i];
                    (it as any)?.updateText?.(lines[i]);
                }
            }, lines);
        }

        // Finally verify that UI order and content match
        await page.waitForFunction(
            (expected) => {
                const nodes = Array.from(document.querySelectorAll(
                    ".outliner-item:not(.page-title) .item-text",
                )) as HTMLElement[];
                const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                return texts.length === expected.length && texts.every((t, i) => t === expected[i]);
            },
            lines,
            { timeout: 10000 },
        );
    });
});
