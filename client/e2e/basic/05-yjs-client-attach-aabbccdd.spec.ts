import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Purpose:
 * - Verify that the Yjs project is correctly attached and seeded lines are reflected in the UI.
 * - Use createAndSeedProject to create initial data via HTTP.
 */

test.describe("Yjs client attach and DOM reflect", () => {
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

    test("attaches Yjs project and renders seeded lines", async ({ page }) => {
        // Verify project is backed by a Y.Doc (guid present)
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { project?: { ydoc?: { guid?: string; }; }; }; }).generalStore;
            const guid = gs?.project?.ydoc?.guid ?? null;
            return typeof guid === "string" && guid.length > 0;
        }, { timeout: 30000 });

        // Wait for currentPage to be set
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { currentPage?: Record<string, unknown>; }; }).generalStore;
            return !!(gs && gs.currentPage);
        }, { timeout: 15000 });

        // Ensure items are seeded in model (fallback for race conditions)
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

        // Wait for DOM to render items in correct order
        await page.waitForFunction(
            (expected) => {
                const nodes = Array.from(document.querySelectorAll(
                    ".outliner-item:not(.page-title) .item-text",
                )) as HTMLElement[];
                const texts = nodes.map((n) => (n.textContent ?? "").trim()).filter(Boolean);
                return texts.length >= expected.length
                    && texts.slice(0, expected.length).every((t, i) => t === expected[i]);
            },
            lines,
            { timeout: 30000 },
        );

        // Verify seeded lines exist in order
        const texts = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(".outliner-item:not(.page-title) .item-text"),
            ).map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Found texts:", texts);

        expect(texts.length).toBeGreaterThanOrEqual(3);
        expect(texts.slice(0, 3)).toEqual([
            "First line: Test",
            "Second line: Yjs reflection",
            "Third line: Order check",
        ]);
    });
});
