// Browser-test helpers for structural Diagram clipboard operations (#5314).
//
// Selections are set through the editor store's own door (as the component
// clipboard specs do), then the real keyboard shortcuts drive the production
// Copy/Cut/Paste handlers and the operating-system clipboard. Assertions read
// project objects, occurrence targets and parent ids — not only rendering.
//
// Readiness (#5735): the production copy/cut/paste handlers are bound to the
// global textarea and report a diagram-clipboard-result only once they run. A
// real Ctrl+C/X/V issued while another element holds focus, or while the
// selection has not reached the store yet, never reaches them and emits
// nothing — which used to surface only later as a zero-result clipboard wait
// on the first attempt. Every entry point below therefore proves its own
// precondition (focused keyboard target, stored selection over visible rows,
// structured capture for Copy, reported outcome for Cut) and fails fast with
// that precondition named, instead of letting a silent drop through.
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

/**
 * Focus the global textarea and prove it owns the keyboard target. The
 * production clipboard handlers never run for a keypress sent elsewhere.
 */
async function keyboardTarget(page: Page): Promise<void> {
    await page.locator("textarea.global-textarea").focus();
    await page.waitForFunction(
        () => {
            const textarea = document.querySelector(".global-textarea");
            return !!textarea && document.activeElement === textarea;
        },
        undefined,
        { timeout: 15000 },
    );
}

/** Structurally select whole rows from `firstId` through `lastId` (node boundaries for blocks). */
export async function selectWholeRows(page: Page, firstId: string, lastId: string): Promise<void> {
    await keyboardTarget(page);
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
    // Prove the selection the next keyboard operation will read: the store
    // holds a local range over both rows, both rows are visible in outline
    // order, and the textarea still owns the keyboard target.
    await expect.poll(async () => {
        const state = await page.evaluate(([first, last]) => {
            const w = globalThis as any;
            const textarea = document.querySelector(".global-textarea");
            const focused = !!textarea && document.activeElement === textarea;
            const visible = new Set(
                ((w.generalStore?.activeViewModel?.getVisibleItems?.() ?? []) as Array<any>)
                    .map(entry => entry?.model?.id),
            );
            const selections = Object.values(w.editorOverlayStore?.selections ?? {}) as Array<any>;
            const covers = selections.some(selection =>
                !selection.isBoxSelection
                && ((selection.startItemId === first && selection.endItemId === last)
                    || (selection.startItemId === last && selection.endItemId === first))
            );
            return { focused, visibleFirst: visible.has(first), visibleLast: visible.has(last), covers };
        }, [firstId, lastId] as const);
        return state.focused && state.visibleFirst && state.visibleLast && state.covers
            ? "ready"
            : `focused=${state.focused} visibleFirst=${state.visibleFirst} `
                + `visibleLast=${state.visibleLast} covers=${state.covers}`;
    }, { timeout: 15000 }).toBe("ready");
}

export async function copySelection(page: Page): Promise<void> {
    await keyboardTarget(page);
    // Clear the E2E capture bridge so the wait below observes this Copy only:
    // a stale value would mask a degraded text-only capture.
    await page.evaluate(() => {
        delete (globalThis as any).lastCopiedStructuredItems;
    });
    await page.keyboard.press("Control+c");
    // A structural Copy reports no diagram-clipboard-result on success, so the
    // paste-time wait cannot detect a degraded text-only capture. The
    // production handler records its structured payload on the E2E clipboard
    // bridge (window.lastCopiedStructuredItems); require it here, while the
    // failure still names the Copy.
    await expect.poll(() =>
        page.evaluate(() => {
            const captured = (globalThis as any).lastCopiedStructuredItems;
            return typeof captured === "string" && captured.length > 0 ? "captured" : "pending";
        }), { timeout: 20000 }).toBe("captured");
}

export async function cutSelection(page: Page): Promise<void> {
    await keyboardTarget(page);
    const before = await clipboardResults(page).then(results => results.length);
    await page.keyboard.press("Control+x");
    // Cut always reports (staged or refused) once its handler runs; a silent
    // drop (wrong focus, lost selection) used to surface only later as a
    // zero-result wait. Require the new outcome here instead.
    await expect.poll(() => clipboardResults(page).then(results => results.length), { timeout: 20000 })
        .toBeGreaterThanOrEqual(before + 1);
}

/** Put the caret at the end of a Text row and paste the real clipboard there. */
export async function pasteAfterRow(page: Page, row: Locator): Promise<void> {
    await row.locator(".item-content").first().click({ force: true });
    await TestHelpers.waitForCursorVisible(page);
    // A visible caret does not prove the keyboard target: a paste issued while
    // the textarea is unfocused never reaches the production paste handler and
    // emits no result.
    await keyboardTarget(page);
    await page.keyboard.press("End");
    await page.keyboard.press("Control+v");
}

/** Paste the real clipboard wherever the caret already is. */
export async function pasteAtCaret(page: Page): Promise<void> {
    await keyboardTarget(page);
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
    const row = page.locator(".outliner-item:not(.page-title)", { hasText: text }).last();
    await expect(row).toBeVisible();
    return row;
}

export async function rowId(row: Locator): Promise<string> {
    return (await row.getAttribute("data-item-id"))!;
}
