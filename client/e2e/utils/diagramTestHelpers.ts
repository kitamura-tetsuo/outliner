// Shared browser-test helpers for native Diagram source editing (#5311).
//
// Diagrams and occurrences are created through the production slash-command
// UI; source is seeded through the Diagram domain write path; every assertion
// reads the canonical source and the rendered projection separately.
import { expect, type Locator, type Page } from "@playwright/test";

/** Open the slash palette in `row` and create a new Diagram there. Returns its ids. */
export async function insertDiagram(page: Page, row: Locator): Promise<{ diagramId: string; occurrenceId: string; }> {
    const before = await occurrenceIds(page);
    await row.locator(".item-content").click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.keyboard.type("/");
    await page.locator('[data-testid="command-item-diagram"]').click();
    await expect.poll(() => occurrenceIds(page).then(ids => ids.length)).toBe(before.length + 1);
    const occurrenceId = (await occurrenceIds(page)).find(id => !before.includes(id))!;
    const diagramId = (await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`)
        .getAttribute("data-diagram-id"))!;
    return { diagramId, occurrenceId };
}

/** Insert a transclusion of the (only) existing Diagram in `row`. Returns the new occurrence id. */
export async function insertTransclusion(page: Page, row: Locator): Promise<string> {
    const before = await occurrenceIds(page);
    await row.locator(".item-content").click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("End");
    await page.keyboard.type("/");
    await page.locator('[data-testid="command-item-diagram-transclusion"]').click();
    const chooser = page.getByTestId("diagram-chooser");
    await expect(chooser).toBeVisible({ timeout: 10000 });
    await chooser.getByTestId("diagram-chooser-option").first().click();
    await chooser.getByTestId("diagram-chooser-confirm").click();
    await expect.poll(() => occurrenceIds(page).then(ids => ids.length)).toBe(before.length + 1);
    return (await occurrenceIds(page)).find(id => !before.includes(id))!;
}

/** Item ids of every rendered Diagram occurrence, in page order. */
export function occurrenceIds(page: Page): Promise<string[]> {
    return page.locator('[data-testid="diagram-block"]').evaluateAll(elements =>
        elements.map(el => el.closest(".outliner-item")?.getAttribute("data-item-id") ?? "")
    );
}

/** Seed source through the Diagram domain write path (not a native edit, no history). */
export async function seedSource(page: Page, diagramId: string, source: string): Promise<void> {
    await page.evaluate(([id, text]) => {
        const w = globalThis as any;
        w.diagramService.setDiagramSource(w.generalStore.project, id, text);
    }, [diagramId, source] as const);
}

/** The canonical Diagram source, read from the project-owned object. */
export function readSource(page: Page, diagramId: string): Promise<string | undefined> {
    return page.evaluate(id => {
        const w = globalThis as any;
        return w.diagramService.getDiagram(w.generalStore.project, id)?.source;
    }, diagramId);
}

/** Local logical cursors as the editor holds them. */
export function localCursors(page: Page): Promise<Array<{ itemId: string; offset: number; }>> {
    return page.evaluate(() => {
        const store = (globalThis as any).editorOverlayStore;
        return store.getLocalCursorInstances().map((c: any) => ({ itemId: c.itemId, offset: c.offset }));
    });
}

export function sourceView(page: Page, occurrenceId: string): Locator {
    return page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-source"]`);
}

/**
 * Canonical offsets at which carets are painted in one occurrence, measured from
 * the DOM itself: the UTF-16 length of the source text rendered before each
 * caret (ephemeral preedit excluded). Independent of any data attribute.
 */
export function paintedCarets(page: Page, occurrenceId: string): Promise<number[]> {
    return page.evaluate(occ => {
        const root = document.querySelector(`[data-item-id="${occ}"] [data-testid="diagram-source"]`);
        if (!root) return [];
        const offsets: number[] = [];
        let total = 0;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (!(node.parentElement?.closest("[data-ephemeral]"))) total += (node as Text).data.length;
            } else if ((node as Element).classList.contains("diagram-caret")) {
                offsets.push(total);
            }
        }
        return offsets;
    }, occurrenceId);
}

/**
 * Viewport position of a canonical source offset in one occurrence's rendered
 * source, measured by summing the UTF-16 length of the rendered source text.
 */
export function offsetPoint(page: Page, occurrenceId: string, offset: number): Promise<{ x: number; y: number; }> {
    return page.evaluate(([occ, target]) => {
        const root = document.querySelector(`[data-item-id="${occ}"] [data-testid="diagram-source"]`)!;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes: Text[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!(node.parentElement?.closest("[data-ephemeral]"))) nodes.push(node as Text);
        }
        // Measure a real character box (a collapsed range at a text node's edge can
        // report an empty rectangle): the character after the offset, or at the end
        // of the source the character before it.
        const text = nodes.map(n => n.data).join("");
        const atEnd = target >= text.length;
        const charStart = atEnd
            ? Math.max(0, target - (/[\udc00-\udfff]/.test(text[target - 1] ?? "") ? 2 : 1))
            : target;
        const charEnd = atEnd ? target : target + (/[\ud800-\udbff]/.test(text[target]) ? 2 : 1);
        let remaining = charStart;
        for (const node of nodes) {
            if (remaining < node.data.length) {
                const range = document.createRange();
                range.setStart(node, remaining);
                range.setEnd(node, remaining + (charEnd - charStart));
                const rect = range.getBoundingClientRect();
                return { x: atEnd ? rect.right : rect.left, y: rect.top + rect.height / 2 };
            }
            remaining -= node.data.length;
        }
        throw new Error(`offset ${target} is outside the rendered source`);
    }, [occurrenceId, offset] as const);
}

/** Horizontal position of the caret painted in one occurrence. */
export function caretX(page: Page, occurrenceId: string): Promise<number> {
    return page.locator(`[data-item-id="${occurrenceId}"] .diagram-caret`).first().evaluate(el =>
        el.getBoundingClientRect().left
    );
}

/** Click inside one occurrence's rendered source so the hit test resolves `offset`. */
export async function clickSourceAt(
    page: Page,
    occurrenceId: string,
    offset: number,
    options: { alt?: boolean; } = {},
) {
    const source = await readRenderedSource(page, occurrenceId);
    const point = await offsetPoint(page, occurrenceId, offset);
    const x = offset >= source.length ? point.x + 20 : point.x + 1;
    if (options.alt) await page.keyboard.down("Alt");
    await page.mouse.click(x, point.y);
    if (options.alt) await page.keyboard.up("Alt");
}

/** Drag across one occurrence's rendered source from one canonical offset to another. */
export async function dragSource(
    page: Page,
    occurrenceId: string,
    from: number,
    to: number,
    options: { alt?: boolean; } = {},
) {
    const start = await offsetPoint(page, occurrenceId, from);
    const end = await offsetPoint(page, occurrenceId, to);
    if (options.alt) await page.keyboard.down("Alt");
    await page.mouse.move(start.x + 1, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x + 1, end.y, { steps: 4 });
    await page.mouse.up();
    if (options.alt) await page.keyboard.up("Alt");
}

function readRenderedSource(page: Page, occurrenceId: string): Promise<string> {
    return page.evaluate(occ => {
        const root = document.querySelector(`[data-item-id="${occ}"] [data-testid="diagram-source"]`);
        if (!root) return "";
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let text = "";
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!(node.parentElement?.closest("[data-ephemeral]"))) text += (node as Text).data;
        }
        return text;
    }, occurrenceId);
}
