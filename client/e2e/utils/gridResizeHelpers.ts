import { type Browser, type BrowserContext, expect, type Locator, type Page } from "@playwright/test";
// The production revision functions the MCP presentation/get_grid reads use.
// They are pure Node code (crypto + JSON), so the Playwright runner computes
// them over the browser's saved Grid entry instead of a re-implementation.
import { gridPresentationRevision } from "../../../server/src/mcp/grid-presentation";
import { revisionOf } from "../../../server/src/mcp/mutation-contract";
import { readWidthGridRegistry, type WidthGridEntry } from "./gridWidthHelpers";

/**
 * Helpers for Grid header drag-resize E2E specs (issue #5459). Every resize
 * is a real pointer gesture through the dedicated handle; saved state,
 * Yjs registry updates and history depth are observed independently of the
 * component through the live project document and the global undo router.
 */

export function resizeHandle(page: Page, placement: number, column: string): Locator {
    return page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid")
        .locator(`th[data-col="${column}"] [data-testid="yjs-table-column-resize-handle"]`);
}

export function gridHeader(page: Page, placement: number, column: string): Locator {
    return page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid")
        .locator(`th[data-col="${column}"]`);
}

/** Press the primary mouse button on a column's resize handle; returns the press point. */
export async function pressResizeHandle(
    page: Page,
    placement: number,
    column: string,
): Promise<{ x: number; y: number; }> {
    const handle = resizeHandle(page, placement, column);
    // Center vertically: `scrollIntoViewIfNeeded` can park the header under
    // the sticky main toolbar, where a press would hit the toolbar instead.
    await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
    const box = await handle.boundingBox();
    if (!box) throw new Error(`resize handle for ${column} has no box`);
    const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-testid"), point);
    if (hit !== "yjs-table-column-resize-handle") throw new Error(`resize press for ${column} would hit ${hit}`);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return point;
}

/** Measured border-box width of the header in one placement. */
export async function headerWidth(page: Page, placement: number, column: string): Promise<number> {
    const box = await gridHeader(page, placement, column).boundingBox();
    if (!box) throw new Error(`header ${column} has no box`);
    return box.width;
}

/** Header and every body-cell width of one placement, within 1 CSS px of `px`. */
export async function expectColumnGeometry(page: Page, placement: number, column: string, px: number) {
    const grid = page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid");
    let widths: number[] = [];
    try {
        await expect.poll(async () => {
            const boxes = [await grid.locator(`th[data-col="${column}"]`).boundingBox()];
            const cells = grid.locator(`td[data-col="${column}"]`);
            for (let i = 0; i < await cells.count(); i++) boxes.push(await cells.nth(i).boundingBox());
            widths = boxes.map((b) => b?.width ?? Number.NaN);
            return widths.every((w) => Math.abs(w - px) <= 1);
        }, { timeout: 15000 }).toBe(true);
    } catch (error) {
        throw new Error(
            `column ${column} should measure ${px}px; measured ${JSON.stringify(widths)}: ${String(error)}`,
        );
    }
}

/**
 * Count Grid-registry deep changes and project-doc updates from now on, plus
 * the global undo history depth, independently of the Grid component.
 */
export async function installWriteProbe(page: Page): Promise<void> {
    await page.evaluate(() => {
        const g = globalThis as unknown as {
            __YJS_STORE__?: { yjsClient?: { getProject: () => unknown; }; };
            __resizeProbe?: { registry: number; updates: number; dispose: () => void; };
        };
        g.__resizeProbe?.dispose();
        const project = g.__YJS_STORE__?.yjsClient?.getProject() as {
            ydoc: {
                getMap: (k: string) => {
                    observeDeep: (fn: () => void) => void;
                    unobserveDeep: (fn: () => void) => void;
                };
                on: (e: string, fn: () => void) => void;
                off: (e: string, fn: () => void) => void;
            };
        };
        const registry = project.ydoc.getMap("yjsGrids");
        const probe = { registry: 0, updates: 0, dispose: () => {} };
        const onRegistry = () => probe.registry++;
        const onUpdate = () => probe.updates++;
        registry.observeDeep(onRegistry);
        project.ydoc.on("update", onUpdate);
        probe.dispose = () => {
            registry.unobserveDeep(onRegistry);
            project.ydoc.off("update", onUpdate);
        };
        g.__resizeProbe = probe;
    });
}

export async function readWriteProbe(page: Page): Promise<{ registry: number; updates: number; undoDepth: number; }> {
    return page.evaluate(() => {
        const g = globalThis as unknown as {
            __resizeProbe?: { registry: number; updates: number; };
            globalUndoRouter?: { undoDepth: number; };
        };
        return {
            registry: g.__resizeProbe?.registry ?? -1,
            updates: g.__resizeProbe?.updates ?? -1,
            undoDepth: g.globalUndoRouter?.undoDepth ?? -1,
        };
    });
}

export async function undoDepth(page: Page): Promise<number> {
    return page.evaluate(() =>
        (globalThis as unknown as { globalUndoRouter?: { undoDepth: number; }; }).globalUndoRouter?.undoDepth ?? -1
    );
}

function optionalText(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    return typeof value === "string" ? value : String(value);
}

/**
 * The production presentation revision and query-only (get_grid) revision
 * of one saved Grid entry. The detached snapshot mirrors the server's
 * `readPresentationSnapshot` projection of the stored leaves.
 */
export async function gridRevisions(
    page: Page,
    projectId: string,
    gridId: string,
): Promise<{ presentation: string; query: string; entry: WidthGridEntry; }> {
    const entry = (await readWidthGridRegistry(page)).find((g) => g.gridId === gridId);
    if (!entry) throw new Error(`grid ${gridId} not found`);
    const flags = await page.evaluate((id) => {
        const store = (globalThis as unknown as {
            __YJS_STORE__?: {
                yjsClient?: {
                    getProject: () => { ydoc: { getMap: (k: string) => { get: (k: string) => unknown; }; }; };
                };
            };
        }).__YJS_STORE__;
        const map = store?.yjsClient?.getProject().ydoc.getMap("yjsGrids").get(id) as { get: (k: string) => unknown; };
        return { showAddRowButton: map.get("showAddRowButton"), confirmRowDelete: map.get("confirmRowDelete") };
    }, gridId);
    const names = [...new Set([...Object.keys(entry.components), ...entry.columnOrder])]
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const components = Object.fromEntries(names.map((column) => {
        const cfg = entry.components[column] ?? {};
        const width = cfg["widthPx"];
        return [column, {
            label: optionalText(cfg["label"]),
            type: optionalText(cfg["type"]),
            shown: cfg["hidden"] !== true,
            widthPx: typeof width === "number" && Number.isInteger(width) && width >= 32 && width <= 4096
                ? width
                : null,
        }];
    }));
    const presentation = gridPresentationRevision({
        projectId,
        gridId,
        sourceTableId: entry.sourceTableId || null,
        query: entry.query,
        presentation: {
            name: entry.name,
            columnOrder: entry.columnOrder,
            components,
            showAddRowButton: flags.showAddRowButton !== false,
            confirmRowDelete: flags.confirmRowDelete === true,
        },
    });
    return { presentation, query: revisionOf(entry.query), entry };
}

/**
 * A second normal client on the same project page, logged in and connected,
 * with its Grid rendered. The caller closes the returned context.
 */
export async function openSyncedPeer(
    browser: Browser,
    page: Page,
    storageState: object,
): Promise<{ context: BrowserContext; peer: Page; }> {
    const context = await browser.newContext({ storageState: storageState as never });
    const peer = await context.newPage();
    await peer.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        (globalThis as unknown as { __E2E__?: boolean; }).__E2E__ = true;
    });
    await peer.goto(page.url(), { waitUntil: "domcontentloaded" });
    await peer.waitForFunction(
        () => !!(globalThis as unknown as { __USER_MANAGER__?: unknown; }).__USER_MANAGER__,
        { timeout: 30000 },
    );
    await peer.evaluate(async () => {
        const manager = (globalThis as unknown as {
            __USER_MANAGER__?: { loginWithEmailPassword?: (u: string, p: string) => Promise<void>; };
        }).__USER_MANAGER__;
        await manager?.loginWithEmailPassword?.("test@example.com", "password");
    });
    await peer.waitForFunction(
        () =>
            (globalThis as unknown as { __YJS_STORE__?: { getIsConnected?: () => boolean; }; }).__YJS_STORE__
                ?.getIsConnected?.() === true,
        { timeout: 60000 },
    );
    await expect(peer.getByTestId("yjs-table-grid").first().locator('th[data-col="title"]')).toBeVisible({
        timeout: 60000,
    });
    return { context, peer };
}
