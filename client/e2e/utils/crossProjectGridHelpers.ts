import { expect, type Page, type TestInfo } from "@playwright/test";
import { SeedClient } from "./seedClient";
import { TestHelpers } from "./testHelpers";

export interface ProjectFixture {
    sourceProject: string;
    sourceProjectId: string;
    sourcePage: string;
    destinationProject: string;
    destinationProjectId: string;
    destinationPage: string;
}

export interface GridTableState {
    id: string;
    name: string;
    sqlName: string;
    guid: string;
    schema: string;
    ui: Record<string, unknown>;
    dataSize: number;
    /** Data Storage as plain values: record id -> column -> value. */
    data: Record<string, Record<string, unknown>>;
}

export interface GridProjectState {
    guid: string;
    tables: GridTableState[];
    hostTableIds: string[];
}

/**
 * Creates two separate projects (source and destination) with their own pages,
 * registers both as accessible to the signed-in test user, and stamps their
 * titles into the local metaDoc so the home project selector can list them by
 * title instead of by opaque id.
 */
export async function seedCrossProjectFixture(page: Page, testInfo: TestInfo): Promise<ProjectFixture> {
    const suffix = `${testInfo.workerIndex}-${Date.now()}`;
    const sourceProject = `Grid Source ${suffix}`;
    const sourcePage = `Source Page ${suffix}`;
    const destinationProject = `Grid Destination ${suffix}`;
    const destinationPage = `Destination Page ${suffix}`;
    await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, ["Source anchor", "Source tail"], undefined, {
        projectName: sourceProject,
        pageName: sourcePage,
    });
    await TestHelpers.seedProjectDataOnly(page, testInfo, ["Destination anchor"], {
        projectName: destinationProject,
        pageName: destinationPage,
    });

    const sourceProjectId = SeedClient.stableIdFromTitle(sourceProject);
    const destinationProjectId = SeedClient.stableIdFromTitle(destinationProject);
    await page.waitForFunction(() => !!(globalThis as any).__META_DOC_MODULE__, { timeout: 30000 });
    await page.evaluate(({ sourceId, sourceTitle, destinationId, destinationTitle }) => {
        const meta = (globalThis as any).__META_DOC_MODULE__;
        meta.setContainerTitleInMetaDoc(sourceId, sourceTitle);
        meta.setContainerTitleInMetaDoc(destinationId, destinationTitle);
    }, {
        sourceId: sourceProjectId,
        sourceTitle: sourceProject,
        destinationId: destinationProjectId,
        destinationTitle: destinationProject,
    });
    await TestHelpers.setAccessibleProjects(page, [sourceProjectId, destinationProjectId]);

    return {
        sourceProject,
        sourceProjectId,
        sourcePage,
        destinationProject,
        destinationProjectId,
        destinationPage,
    };
}

/**
 * Navigate via Home -> project selector -> page link, all Svelte-managed.
 * Re-asserts both fixture projects as accessible right before selecting: the
 * emulator-backed test user is shared across parallel workers/tests, so a
 * concurrent test's own `setAccessibleProjects` call can otherwise clobber
 * this fixture's list between an earlier navigation and this one.
 */
export async function openProjectPage(
    page: Page,
    fixture: ProjectFixture,
    target: "source" | "destination",
): Promise<void> {
    const projectId = target === "source" ? fixture.sourceProjectId : fixture.destinationProjectId;
    const project = target === "source" ? fixture.sourceProject : fixture.destinationProject;
    const pageName = target === "source" ? fixture.sourcePage : fixture.destinationPage;

    await page.locator('nav a:has-text("Home")').click();
    await expect(page.getByTestId("home-page")).toBeVisible({ timeout: 15000 });
    await TestHelpers.setAccessibleProjects(page, [fixture.sourceProjectId, fixture.destinationProjectId]);
    // A repeat visit to a project already opened earlier in this test can hit
    // yjsService's "Test Project" fallback title (createClient()'s default
    // when window.__CURRENT_PROJECT_TITLE__ is stale/unset) instead of
    // resolving the real title. Pre-seed the same global the app's own
    // createNewProject flow sets for this purpose so the fallback (if hit)
    // resolves to the correct title regardless of its root cause.
    await page.evaluate(title => {
        (globalThis as any).__CURRENT_PROJECT_TITLE__ = title;
    }, project);
    try {
        await page.waitForFunction(
            (val) => {
                const sel = document.querySelector("select.project-select") as HTMLSelectElement;
                if (!sel || sel.disabled) return false;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === val) return true;
                }
                return false;
            },
            projectId,
            { timeout: 15000 },
        );
    } catch (_e) {}
    try {
        await page.locator("select.project-select").selectOption({ value: projectId, timeout: 5000 });
    } catch (_e) {}
    await expect(async () => {
        const url = page.url();
        if (url.includes("/Test%20Project") || url.endsWith("/Test Project")) {
            await page.locator('nav a:has-text("Home")').click();
            await expect(page.getByTestId("home-page")).toBeVisible({ timeout: 15000 });
            await TestHelpers.setAccessibleProjects(page, [fixture.sourceProjectId, fixture.destinationProjectId]);
            await page.evaluate(title => {
                (globalThis as any).__CURRENT_PROJECT_TITLE__ = title;
            }, project);
            await page.waitForFunction(
                (val) => {
                    const sel = document.querySelector("select.project-select") as HTMLSelectElement;
                    if (!sel || sel.disabled) return false;
                    for (let i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].value === val) return true;
                    }
                    return false;
                },
                projectId,
                { timeout: 15000 },
            );
            await page.locator("select.project-select").selectOption({ value: projectId });
        }
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(project)}$`), { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await page.waitForFunction(
        expectedId =>
            (globalThis as any).__YJS_STORE__?.isConnected === true
            && (globalThis as any).__YJS_STORE__?.currentProjectId === expectedId,
        projectId,
        { timeout: 30000 },
    );
    // PageListItem renders the page title inside a nested span alongside a
    // preview/date, so its link's accessible name is not the bare title —
    // match by the href PageList.svelte builds instead (exact page match).
    // Scoped to <main> because the sidebar's own (possibly hidden) page list
    // renders a matching-href link earlier in the DOM.
    const pageLink = page.locator("main").locator(`a[href$="/${encodeURIComponent(pageName)}"]`).first();
    await expect(pageLink).toBeVisible({ timeout: 30000 });
    await pageLink.click();
    await expect(page).toHaveURL(
        new RegExp(`/${encodeURIComponent(project)}/${encodeURIComponent(pageName)}$`),
        { timeout: 30000 },
    );
    await TestHelpers.waitForOutlinerItems(page, 2, 30000);
}

/**
 * Clicks the last item (to place the cursor) then adds a Database block from
 * the toolbar. `commandPaletteStore.insert` inserts a NEW item right after
 * the clicked one and gives it componentType "yjstable", so the clicked item
 * itself is never converted — the fresh item after it becomes the Grid host.
 */
export async function createBlankGrid(page: Page, name: string, sqlName: string): Promise<void> {
    await page.locator(".outliner-item[data-item-id]").last().click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    const panel = page.getByTestId("yjs-table-create-panel").last();
    await expect(panel).toBeVisible();
    await panel.getByTestId("yjs-table-name-input").fill(name);
    await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
    await panel.getByTestId("yjs-table-sql-name-input").fill(sqlName);
    await panel.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("yjs-table-view").last()).toBeVisible({ timeout: 30000 });
}

/** Give a Grid a non-default schema/UI so structure copying is verifiable. */
export async function configureGrid(
    page: Page,
    viewIndex: number,
    schema: string,
    query: string,
    titleLabel: string,
): Promise<void> {
    const view = page.getByTestId("yjs-table-view").nth(viewIndex);

    const schemaInput = view.getByTestId("yjs-table-schema-input");
    if (!await schemaInput.isVisible().catch(() => false)) await view.getByTestId("yjs-table-toggle-schema").click();
    await schemaInput.fill(schema);
    await view.getByTestId("yjs-table-schema-apply").click();
    const warning = view.getByTestId("yjs-table-schema-warning");
    if (await warning.isVisible().catch(() => false)) await view.getByTestId("yjs-table-schema-confirm").click();
    await expect(schemaInput).toHaveValue(schema, { timeout: 30000 });

    const queryInput = view.getByTestId("yjs-table-query-input");
    if (!await queryInput.isVisible().catch(() => false)) await view.getByTestId("yjs-table-toggle-ui").click();
    await queryInput.fill(query);
    await queryInput.press("Tab");
    const titleInput = view.getByTestId("yjs-table-label-title");
    await expect(titleInput).toBeVisible({ timeout: 30000 });
    await titleInput.fill(titleLabel);
    await titleInput.press("Tab");
    await view.getByTestId("yjs-table-component-quantity").selectOption("number");
    await view.getByTestId("yjs-table-hidden-done").check();
    await expect(view.getByTestId("yjs-table-grid").locator("th", { hasText: titleLabel })).toBeVisible({
        timeout: 30000,
    });
}

export async function addSourceRecord(page: Page, viewIndex: number = 0, expectedRows: number = 1): Promise<void> {
    const view = page.getByTestId("yjs-table-view").nth(viewIndex);
    await view.getByTestId("yjs-table-add-row").click();
    await expect(view.getByTestId("yjs-table-grid").locator("tbody tr")).toHaveCount(expectedRows, { timeout: 30000 });
}

/**
 * Type a value into one cell of a rendered Grid, addressed by its record id:
 * the query carries no ORDER BY, so row positions are not stable across edits.
 * A cell shows a button until it is clicked, which is what swaps in the
 * editable input (TextCell.svelte).
 */
export async function setCellValue(
    page: Page,
    viewIndex: number,
    recordId: string,
    column: string,
    value: string,
): Promise<void> {
    const cell = page.getByTestId("yjs-table-view").nth(viewIndex)
        .getByTestId("yjs-table-grid")
        .locator(`td[data-record-id="${recordId}"][data-col="${column}"]`);
    await cell.locator("button.cell-value").click();
    const input = cell.locator("input.cell-input");
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill(value);
    await input.press("Enter");
    await expect(cell.locator("button.cell-value")).toHaveText(value, { timeout: 30000 });
}

/**
 * Select from the item just before the first Grid host through the last Grid
 * host (inclusive of their readable text), then copy with the real system
 * clipboard.
 */
export async function copyGridHosts(page: Page): Promise<void> {
    const hosts = page.getByTestId("yjs-table-view").locator(
        "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' outliner-item ') and @data-item-id][1]",
    );
    const hostIds = await hosts.evaluateAll(elements => elements.map(element => element.getAttribute("data-item-id")!));
    const allIds = await page.locator(".outliner-item[data-item-id]").evaluateAll(
        elements => elements.map(element => element.getAttribute("data-item-id")!),
    );
    const indexes = hostIds.map(id => allIds.indexOf(id)).sort((a, b) => a - b);
    const startIndex = Math.max(0, indexes[0] - 1);
    const start = allIds[startIndex];
    const end = allIds[indexes[indexes.length - 1]];
    const endText = await page.locator(`.outliner-item[data-item-id="${end}"] .item-text`).textContent();
    await page.locator("textarea.global-textarea").focus();
    await page.evaluate(({ startId, endId, endOffset }) => {
        // eslint-disable-next-line no-restricted-globals
        const editor = (window as any).editorOverlayStore;
        editor.clearSelections();
        editor.setSelection({ startItemId: startId, startOffset: 0, endItemId: endId, endOffset, userId: "local" });
    }, { startId: start, endId: end, endOffset: endText?.length ?? 0 });
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
        .not.toBe("");
}

/**
 * Click an item and retry until the cursor is actually active (see #10 in the
 * E2E debugging guide), then explicitly focus the hidden global textarea.
 * Native clipboard events (Ctrl+V) only fire once that element truly has DOM
 * focus, which a bare item click does not always guarantee right after an
 * SPA navigation — the same reason `copyGridHosts` focuses it before Ctrl+C.
 */
export async function clickItemAndWaitForCursor(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
    const deadline = Date.now() + 20000;
    for (;;) {
        await locator.click();
        if (await TestHelpers.waitForCursorVisible(page, 5000)) break;
        if (Date.now() > deadline) throw new Error("Cursor never became active after clicking the target item");
    }
    await page.locator("textarea.global-textarea").focus();
}

export async function pasteAtAnchor(page: Page, expectedViews: number): Promise<void> {
    await clickItemAndWaitForCursor(page, page.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"));
    await page.keyboard.press("Control+v");
    await expect(page.getByTestId("yjs-table-view")).toHaveCount(expectedViews, { timeout: 60000 });
}

/** Read the current project's table registry and Grid host bindings straight from Yjs. */
export async function readGridProjectState(page: Page): Promise<GridProjectState> {
    return page.evaluate(() => {
        // eslint-disable-next-line no-restricted-globals
        const client = (window as any).__YJS_STORE__?.yjsClient;
        const project = client?.getProject();
        if (!project?.ydoc) throw new Error("Current Yjs project is unavailable");
        const tables: GridTableState[] = [];
        project.ydoc.getMap("yjsTables").forEach((entry: any, id: string) => {
            const doc = entry.get("doc");
            tables.push({
                id,
                name: String(entry.get("name") ?? ""),
                sqlName: String(entry.get("sqlName") ?? ""),
                guid: String(doc.guid),
                schema: doc.getText("schema").toString(),
                ui: doc.getMap("ui").toJSON(),
                dataSize: doc.getMap("data").size,
                data: doc.getMap("data").toJSON(),
            });
        });
        const hostTableIds: string[] = [];
        const walk = (items: any) => {
            for (let i = 0; i < items.length; i++) {
                const item = items.at(i);
                if (item?.componentType === "yjstable" && item.yjsTableId) hostTableIds.push(item.yjsTableId);
                if (item?.items) walk(item.items);
            }
        };
        walk(project.items);
        return { guid: project.ydoc.guid, tables, hostTableIds };
    });
}
