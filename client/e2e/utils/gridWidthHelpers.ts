import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for Grid fixed-width E2E specs (issue #5457).
 *
 * Widths are always committed through the supported production writer —
 * `setGridColumnWidth` on the owning Grid's handles, reached through the
 * test-only `__GRID_WIDTH_WRITER__` bridge (non-production bundles only) —
 * never by writing the `widthPx` leaf directly. The full production path
 * (writer validation/history isolation, Yjs observation, placement mirror,
 * render, browser layout) is what every geometry assertion then measures.
 */

export interface WidthGridEntry {
    gridId: string;
    name: string;
    sourceTableId: string;
    query: string;
    columnOrder: string[];
    components: Record<string, Record<string, unknown>>;
}

interface WidthWriterBridge {
    getGridHandles: (ydoc: unknown, gridId: string) => unknown;
    setGridColumnWidth: (handles: unknown, column: string, widthPx: number | undefined) => void;
}

interface YjsProjectShape {
    ydoc: {
        getMap: (key: string) => {
            forEach: (fn: (entry: YjsGridEntryShape, key: string) => void) => void;
        };
    };
}

interface YjsGridEntryShape {
    get: (key: string) => unknown;
}

export async function readWidthGridRegistry(page: Page): Promise<WidthGridEntry[]> {
    return page.evaluate(() => {
        const store =
            (globalThis as unknown as { __YJS_STORE__?: { yjsClient?: { getProject: () => YjsProjectShape; }; }; })
                .__YJS_STORE__;
        const project = store?.yjsClient?.getProject();
        if (!project?.ydoc) throw new Error("Current Yjs project is unavailable");
        const out: WidthGridEntry[] = [];
        project.ydoc.getMap("yjsGrids").forEach((entry: YjsGridEntryShape, gridId: string) => {
            const componentsMap = entry.get("components") as
                | { toJSON?: () => Record<string, Record<string, unknown>>; }
                | undefined;
            const orderValue = entry.get("columnOrder") as
                | string[]
                | { toArray?: () => string[]; }
                | undefined;
            out.push({
                gridId,
                name: String(entry.get("name") ?? ""),
                sourceTableId: String(entry.get("sourceTableId") ?? ""),
                query: String(entry.get("query") ?? ""),
                columnOrder: Array.isArray(orderValue)
                    ? [...orderValue]
                    : typeof orderValue?.toArray === "function"
                    ? orderValue.toArray()
                    : [],
                components: componentsMap?.toJSON ? componentsMap.toJSON() : {},
            });
        });
        return out;
    });
}

/** The single Grid in a fresh single-grid fixture, by insertion order. */
export async function singleGridId(page: Page): Promise<string> {
    const grids = await readWidthGridRegistry(page);
    if (grids.length === 0) throw new Error("no Grid in registry");
    return grids[0].gridId;
}

/**
 * Commit (or, with `undefined`, clear) widths through the production writer
 * against the exact owning Grid. Invalid values throw from the writer itself.
 */
export async function commitWidthsProduction(
    page: Page,
    gridId: string,
    widths: Record<string, number | undefined>,
): Promise<void> {
    await page.evaluate(
        ({ targetGridId, entries }: { targetGridId: string; entries: Array<[string, number | undefined]>; }) => {
            const bridge = (globalThis as unknown as { __GRID_WIDTH_WRITER__?: WidthWriterBridge; })
                .__GRID_WIDTH_WRITER__;
            if (!bridge) throw new Error("production width writer bridge unavailable");
            const store = (globalThis as unknown as {
                __YJS_STORE__?: { yjsClient?: { getProject: () => YjsProjectShape; }; };
            }).__YJS_STORE__;
            const project = store?.yjsClient?.getProject();
            if (!project?.ydoc) throw new Error("Current Yjs project is unavailable");
            const handles = bridge.getGridHandles(project.ydoc, targetGridId);
            if (!handles) throw new Error(`no handles for grid ${targetGridId}`);
            for (const [column, px] of entries) bridge.setGridColumnWidth(handles, column, px);
        },
        { targetGridId: gridId, entries: Object.entries(widths) },
    );
}

/** Header plus every body-cell outer width for one column in one placement. */
export async function placementColumnWidths(page: Page, placement: number, column: string): Promise<number[]> {
    const grid = page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid");
    const header = await grid.locator(`th[data-col="${column}"]`).boundingBox();
    const boxes: number[] = header ? [header.width] : [];
    const cells = grid.locator(`td[data-col="${column}"]`);
    for (let i = 0; i < await cells.count(); i++) {
        const box = await cells.nth(i).boundingBox();
        if (box) boxes.push(box.width);
    }
    return boxes;
}

/** Assert every measured outer box of a fixed column is within 1 CSS px. */
export async function expectFixedWidth(page: Page, placement: number, column: string, px: number): Promise<void> {
    const widths = await placementColumnWidths(page, placement, column);
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) {
        expect(w).toBeGreaterThanOrEqual(px - 1);
        expect(w).toBeLessThanOrEqual(px + 1);
    }
}

/** Assert a column renders automatically: no fixed pin on header or cells. */
export async function expectAutoColumn(page: Page, placement: number, column: string): Promise<void> {
    const grid = page.getByTestId("yjs-table-view").nth(placement).getByTestId("yjs-table-grid");
    const header = grid.locator(`th[data-col="${column}"]`);
    await expect(header).toBeVisible({ timeout: 15000 });
    expect(await header.getAttribute("class")).not.toContain("col-fixed");
    expect(await header.getAttribute("style")).toBeNull();
    // Cleared overrides must leave no residue on body cells either: fixed
    // widths were once pinned inline on headers and cells alike (issue #5457).
    const cells = grid.locator(`td[data-col="${column}"]`);
    for (let i = 0; i < await cells.count(); i++) {
        expect(await cells.nth(i).getAttribute("class")).not.toContain("col-fixed");
        expect(await cells.nth(i).getAttribute("style")).toBeNull();
    }
}
