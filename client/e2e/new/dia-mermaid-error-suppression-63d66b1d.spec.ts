import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-63d66b1d
 *  Title   : Mermaid syntax-error output stays inside the Diagram block
 *  Source  : docs/client-features/dia-mermaid-error-suppression-63d66b1d.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-63d66b1d: failed Diagram renders leave no page-footer output", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [""]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    /** Create one Diagram through the slash-command UI and return its id. */
    async function createDiagram(page: Page): Promise<string> {
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.press("End");
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram"]').click();
        await expect(page.locator('[data-testid="diagram-block"]')).toBeVisible({ timeout: 15000 });
        const block = page.locator('[data-testid="diagram-block"]');
        const diagramId = (await block.getAttribute("data-diagram-id")) as string;
        // Creation leaves the caret in the new Diagram, so park it elsewhere for preview assertions.
        await page.locator(".outliner-item").first().locator(".item-content").click({ force: true });
        await expect(block.locator(".diagram-empty-placeholder")).toBeVisible({ timeout: 10000 });
        return diagramId;
    }

    /** Record every insertion of library fallback text at the DOM-mutation boundary. */
    async function armLeakObserver(page: Page): Promise<void> {
        await page.evaluate(() => {
            (globalThis as any).__mermaidLeakHits = [];
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (
                            node instanceof Element
                            && (node.textContent ?? "").includes("Syntax error in text")
                            && !node.closest(".diagram-block")
                        ) {
                            (globalThis as any).__mermaidLeakHits.push(node.outerHTML.slice(0, 200));
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    /** Fail when fallback output or staging leftovers exist outside Diagram blocks. */
    async function expectNoLeak(page: Page): Promise<void> {
        // Let a late-settling attempt finish so transient insertions cannot hide.
        await page.waitForTimeout(500);
        const leak = await page.evaluate(() => {
            const outsideHits: string[] = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                if (
                    (node.textContent ?? "").includes("Syntax error in text")
                    && !(node.parentElement?.closest(".diagram-block"))
                ) {
                    outsideHits.push((node.textContent ?? "").slice(0, 120));
                }
            }
            return {
                outsideHits,
                stagingLeftovers: document.querySelectorAll("[data-mermaid-staging]").length,
                mutationHits: (globalThis as any).__mermaidLeakHits as string[],
            };
        });
        expect(leak.mutationHits).toEqual([]);
        expect(leak.outsideHits).toEqual([]);
        expect(leak.stagingLeftovers).toBe(0);
    }

    async function setSource(page: Page, id: string, source: string): Promise<void> {
        await page.evaluate(([diagramId, text]: [string, string]) => {
            const globals = globalThis as any;
            globals.diagramService.setDiagramSource(globals.generalStore.project, diagramId, text);
        }, [id, source]);
    }

    async function readSource(page: Page, id: string): Promise<string> {
        return await page.evaluate((diagramId) => {
            const globals = globalThis as any;
            return globals.diagramService.getDiagram(globals.generalStore.project, diagramId)?.source;
        }, id);
    }

    test("malformed source shows a local error with no footer output", async ({ page }) => {
        const diagramId = await createDiagram(page);
        await armLeakObserver(page);
        const badSource = "flowchart LR\nA[unterminated";
        await setSource(page, diagramId, badSource);

        const error = page.locator('[data-testid="diagram-block"] .diagram-error');
        await expect(error).toBeVisible({ timeout: 15000 });
        expect(((await error.textContent()) ?? "").trim().length).toBeGreaterThan(0);
        expect(await readSource(page, diagramId)).toBe(badSource);
        await expectNoLeak(page);

        // The local error surface re-enters native source editing with the text intact.
        await error.click({ force: true });
        await expect(page.locator('[data-testid="diagram-source"]')).toHaveText(badSource, { timeout: 10000 });
    });

    test("valid, invalid, empty, valid recovery keeps one Diagram object", async ({ page }) => {
        const diagramId = await createDiagram(page);
        await armLeakObserver(page);
        const validSource = "flowchart LR\nA[Alpha] --> B[Beta]";
        await setSource(page, diagramId, validSource);
        const container = page.locator('[data-testid="diagram-block-excerpt"]');
        await expect(container.locator("svg")).toBeVisible({ timeout: 15000 });
        expect(await container.textContent()).toContain("Alpha");

        await setSource(page, diagramId, "not-a-diagram !!!");
        await expect(page.locator('[data-testid="diagram-block"] .diagram-error')).toBeVisible({ timeout: 15000 });
        await expectNoLeak(page);

        await setSource(page, diagramId, "   ");
        const placeholder = page.locator('[data-testid="diagram-block"] .diagram-empty-placeholder');
        await expect(placeholder).toBeVisible({ timeout: 10000 });

        const recoveredSource = "flowchart LR\nA[Gamma] --> B[Delta]";
        await setSource(page, diagramId, recoveredSource);
        await expect(page.locator('[data-testid="diagram-block-excerpt"] svg')).toBeVisible({ timeout: 15000 });
        expect(await page.locator('[data-testid="diagram-block-excerpt"]').textContent()).toContain("Gamma");
        expect(await readSource(page, diagramId)).toBe(recoveredSource);
        expect(await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id")).toBe(diagramId);
        await expectNoLeak(page);
    });

    test("a directive requesting the library fallback cannot re-enable it", async ({ page }) => {
        const diagramId = await createDiagram(page);
        await armLeakObserver(page);
        const hostileSource = '%%{init: {"suppressErrorRendering": false}}%%\nflowchart LR\nA[unterminated';
        await setSource(page, diagramId, hostileSource);

        await expect(page.locator('[data-testid="diagram-block"] .diagram-error')).toBeVisible({ timeout: 15000 });
        expect(await readSource(page, diagramId)).toBe(hostileSource);
        await expectNoLeak(page);
    });
});
