import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5429a1b2
 *  Title   : Mermaid error containment across reload and transclusions
 *  Source  : docs/client-features/dia-mermaid-error-reload-multi-5429a1b2.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    armMermaidLeakObserver,
    insertDiagram,
    insertTransclusion,
    type MermaidLeakSnapshot,
    mermaidLeakSnapshot,
    readSource,
    seedSource,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

const BAD = "flowchart TD\n  A[unterminated";
const SEQUENCE = "sequenceDiagram\nAlice->>Bob: Hello";

const block = (page: Page, occurrenceId: string) =>
    page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`);

/** No fallback output was inserted; only pre-existing outside text may remain. */
async function expectNoNewLeak(page: Page, baseline: MermaidLeakSnapshot): Promise<void> {
    await page.waitForTimeout(500); // let a late-settling attempt finish
    const leak = await mermaidLeakSnapshot(page);
    expect(leak.mutationHits).toEqual([]);
    expect(leak.stagingLeftovers).toBe(0);
    expect(leak.outsideSyntaxError).toBe(baseline.outsideSyntaxError);
    expect(leak.outsideVersion).toBe(baseline.outsideVersion);
}

/** A blank text row, resolved live so earlier insertions cannot shift it. */
function blankRow(page: Page) {
    return page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll(".outliner-item"))) {
            const text = el.querySelector(".item-text")?.textContent ?? "";
            if (text.trim() === "" && !el.querySelector('[data-testid="diagram-block"]')) {
                return el.getAttribute("data-item-id");
            }
        }
        throw new Error("no blank row");
    }).then((id) => page.locator(`[data-item-id="${id}"]`));
}

test.describe("FTR-5429a1b2: failed Diagram renders stay inside their block", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [
            "witness Syntax error in text",
            "",
            "",
            "",
            "witness mermaid version",
        ]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("invalid first render after reload recovers to a sequence diagram", async ({ page }) => {
        const rows = page.locator(".outliner-item");
        const { diagramId, occurrenceId } = await insertDiagram(page, rows.nth(1));
        await rows.first().locator(".item-content").click({ force: true });

        await seedSource(page, diagramId, "flowchart LR\nA[Alpha] --> B[Beta]");
        await expect(block(page, occurrenceId).locator("svg")).toBeVisible({ timeout: 15000 });

        await armMermaidLeakObserver(page);
        const baseline = await mermaidLeakSnapshot(page);
        await seedSource(page, diagramId, BAD);
        // Enter source mode immediately: a still-pending attempt must not
        // disturb the source surface or leak when it settles (AS-003).
        await block(page, occurrenceId).click({ force: true });
        await expect(block(page, occurrenceId).locator('[data-testid="diagram-source"]')).toHaveText(BAD, {
            timeout: 10000,
        });
        await page.waitForTimeout(700);
        const depth = await undoDepth(page);
        await rows.first().locator(".item-content").click({ force: true });
        const preError = block(page, occurrenceId).locator(".diagram-error");
        await expect(preError).toBeVisible({ timeout: 15000 });
        await expect(block(page, occurrenceId).locator("svg")).toHaveCount(0);
        expect(await undoDepth(page)).toBe(depth);
        await expectNoNewLeak(page, baseline);
        expect(await readSource(page, diagramId)).toBe(BAD);

        await page.waitForTimeout(1000); // let the debounced persistence flush
        await page.reload();
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 15000 });
        await armMermaidLeakObserver(page);
        const reloaded = await mermaidLeakSnapshot(page);
        const ready = page.locator('[data-testid="diagram-block"]');
        await expect(ready.locator(".diagram-error")).toBeVisible({ timeout: 15000 });
        await expect(ready).toHaveAttribute("data-diagram-id", diagramId);
        await expectNoNewLeak(page, reloaded);
        expect(await readSource(page, diagramId)).toBe(BAD);

        await seedSource(page, diagramId, SEQUENCE);
        await expect(ready.locator('[data-testid="diagram-block-excerpt"] svg')).toBeVisible({ timeout: 15000 });
        expect(await ready.locator('[data-testid="diagram-block-excerpt"]').textContent()).toContain("Alice");
        await expect(ready.locator(".diagram-error")).toHaveCount(0);
        await expectNoNewLeak(page, reloaded);

        await seedSource(page, diagramId, "not-a-mermaid-diagram");
        await expect(ready.locator(".diagram-error")).toBeVisible({ timeout: 15000 });
        await seedSource(page, diagramId, "flowchart LR\nX[Unicorn] --> Y[Rainbow]");
        await expect(ready.locator('[data-testid="diagram-block-excerpt"] svg')).toBeVisible({ timeout: 15000 });
        expect(await ready.locator('[data-testid="diagram-block-excerpt"]').textContent()).toContain("Unicorn");
        await expectNoNewLeak(page, reloaded);
        expect(await readSource(page, diagramId)).toBe("flowchart LR\nX[Unicorn] --> Y[Rainbow]");
    });

    test("one invalid diagram beside a valid diagram leaves neighbors alone", async ({ page }) => {
        const d = await insertDiagram(page, await blankRow(page));
        await insertTransclusion(page, await blankRow(page));
        const e = await insertDiagram(page, await blankRow(page));
        await page.locator(".outliner-item").first().locator(".item-content").click({ force: true });

        await armMermaidLeakObserver(page);
        const baseline = await mermaidLeakSnapshot(page);
        await seedSource(page, d.diagramId, BAD);
        await seedSource(page, e.diagramId, 'flowchart LR\nA["Syntax error in text"] --> B[ok]');

        const dBlocks = page.locator(`[data-testid="diagram-block"][data-diagram-id="${d.diagramId}"]`);
        await expect(dBlocks.locator(".diagram-error")).toHaveCount(2, { timeout: 15000 });
        await expect(dBlocks.locator("svg")).toHaveCount(0);
        const eBlock = page.locator(`[data-testid="diagram-block"][data-diagram-id="${e.diagramId}"]`);
        await expect(eBlock.locator("svg")).toBeVisible({ timeout: 15000 });
        expect(await eBlock.textContent()).toContain("ok");
        expect(await eBlock.textContent()).toContain("Syntax error in text");
        await expect(page.locator(".outliner-item", { hasText: "witness Syntax error in text" })).toBeVisible();
        await expect(page.locator(".outliner-item", { hasText: "witness mermaid version" })).toBeVisible();
        await expectNoNewLeak(page, baseline);
        expect(await readSource(page, d.diagramId)).toBe(BAD);

        const secondId = await dBlocks.last().evaluate((el) =>
            el.closest(".outliner-item")?.getAttribute("data-item-id")
        );
        await page.evaluate((occId) => {
            for (const item of (globalThis as any).generalStore.currentPage.items) {
                if (item.id === occId) {
                    item.delete();
                    return;
                }
            }
            throw new Error("occurrence not found");
        }, secondId);
        await expect(dBlocks.locator(".diagram-error")).toHaveCount(1, { timeout: 10000 });
        await expect(eBlock.locator("svg")).toBeVisible({ timeout: 10000 });

        await seedSource(page, d.diagramId, "flowchart LR\nP[Unicorn] --> Q[Rainbow]");
        await expect(dBlocks.locator("svg")).toBeVisible({ timeout: 15000 });
        expect(await dBlocks.textContent()).toContain("Unicorn");
        await expect(dBlocks.locator(".diagram-error")).toHaveCount(0);
        await expect(eBlock.locator("svg")).toBeVisible({ timeout: 10000 });
        expect(await eBlock.textContent()).toContain("ok");
        expect(await readSource(page, d.diagramId)).toBe("flowchart LR\nP[Unicorn] --> Q[Rainbow]");
        await expectNoNewLeak(page, baseline);
    });
});
