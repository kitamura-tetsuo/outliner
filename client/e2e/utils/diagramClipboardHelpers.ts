// Browser-test helpers for structural Diagram clipboard operations (#5314).
//
// Selections are set through the editor store's own door (as the component
// clipboard specs do), then the real keyboard shortcuts drive the production
// Copy/Cut/Paste handlers and the operating-system clipboard. Assertions read
// project objects, occurrence targets and parent ids — not only rendering.
import { expect, type Locator, type Page } from "@playwright/test";
import { TestHelpers } from "./testHelpers";

export interface OutlineNode {
    id: string;
    kind: string;
    text: string;
    diagramId?: string;
    children: OutlineNode[];
}

/** Start recording every Diagram clipboard outcome the page reports. */
export async function recordClipboardResults(page: Page): Promise<void> {
    await page.evaluate(() => {
        const w = globalThis as any;
        w.__diagramClipboardResults = [];
        globalThis.addEventListener("diagram-clipboard-result", event => {
            w.__diagramClipboardResults.push((event as CustomEvent).detail);
        });
    });
}

export function clipboardResults(page: Page): Promise<Array<Record<string, any>>> {
    return page.evaluate(() => (globalThis as any).__diagramClipboardResults ?? []);
}

export async function lastClipboardResult(page: Page, count: number): Promise<Record<string, any>> {
    await expect.poll(() => clipboardResults(page).then(r => r.length)).toBeGreaterThanOrEqual(count);
    return (await clipboardResults(page))[count - 1];
}

/** Structurally select whole rows from `firstId` through `lastId` (node boundaries for blocks). */
export async function selectWholeRows(page: Page, firstId: string, lastId: string): Promise<void> {
    await page.locator("textarea.global-textarea").focus();
    await page.evaluate(([first, last]) => {
        const w = globalThis as any;
        const items = w.generalStore.project;
        const find = (id: string) => {
            const tree = items.tree;
            const value = tree.getNodeValueFromKey(id);
            return { isVisual: Boolean(value.get("componentType")), text: String(value.get("text") ?? "") };
        };
        const edge = (id: string, side: "before" | "after") => {
            const node = find(id);
            return node.isVisual
                ? { kind: "node-boundary", itemId: id, side }
                : { kind: "text", itemId: id, offset: side === "before" ? 0 : node.text.length };
        };
        const store = w.editorOverlayStore;
        store.clearSelections();
        store.setSelection({ start: edge(first, "before"), end: edge(last, "after"), userId: "local" });
    }, [firstId, lastId] as const);
}

export async function copySelection(page: Page): Promise<void> {
    await page.keyboard.press("Control+c");
}

export async function cutSelection(page: Page): Promise<void> {
    await page.keyboard.press("Control+x");
}

/** Put the caret at the end of a Text row and paste the real clipboard there. */
export async function pasteAfterRow(page: Page, row: Locator): Promise<void> {
    await row.locator(".item-content").first().click({ force: true });
    await TestHelpers.waitForCursorVisible(page);
    await page.keyboard.press("End");
    await page.keyboard.press("Control+v");
}

/** Paste the real clipboard wherever the caret already is. */
export async function pasteAtCaret(page: Page): Promise<void> {
    await page.locator("textarea.global-textarea").focus();
    await page.keyboard.press("Control+v");
}

/** The current page's outline, straight from the tree. */
export function pageOutline(page: Page): Promise<OutlineNode[]> {
    return page.evaluate(() => {
        const read = (items: any): any[] =>
            [...items].map((item: any) => {
                const value = item.tree.getNodeValueFromKey(item.key);
                return {
                    id: item.id,
                    kind: item.componentType ?? "text",
                    text: String(item.text ?? ""),
                    diagramId: value.get("diagramId") ?? undefined,
                    children: read(item.items),
                };
            });
        return read((globalThis as any).generalStore.currentPage.items);
    });
}

/** Every Diagram object in the project, with its source. */
export function projectDiagrams(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const w = globalThis as any;
        return Object.fromEntries(
            w.diagramService.listDiagrams(w.generalStore.project).map((d: any) => [d.id, d.source]),
        );
    });
}

export async function rowByText(page: Page, text: string): Promise<Locator> {
    const row = page.locator(".outliner-item", { hasText: text }).last();
    await expect(row).toBeVisible();
    return row;
}

export async function rowId(row: Locator): Promise<string> {
    return (await row.getAttribute("data-item-id"))!;
}
