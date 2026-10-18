/** @feature CLP-4584c0de */
import { expect, readClipboardAndRecord, recordGridClipboardDiagnostic, test } from "../fixtures/grid-render-trace";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("component block clipboard", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Block host", "Neighbor", "Paste below"]);
    });

    test("copy and paste creates a second live view of the same Grid", async ({ page }) => {
        await page.evaluate(() => {
            (globalThis as any).__gridClipboardDiagnostic = {
                sourceId: "unavailable",
                neighborId: "unavailable",
                destinationId: "unavailable",
                selection: "unavailable",
                focus: "unavailable",
                renderedColumns: [],
                rowCount: 0,
                copyingReached: false,
                clipboardText: "unavailable",
                readinessSamples: [],
            };
            const sample = () => {
                const grid = document.querySelector('[data-testid="yjs-table-grid"]');
                if (!grid) return;
                const columns = [...(grid?.querySelectorAll("thead th[data-col]") ?? [])]
                    .map(element => element.getAttribute("data-col"));
                const rowCount = grid?.querySelectorAll("tbody tr").length ?? 0;
                const sourceId = grid.closest<HTMLElement>(".outliner-item[data-item-id]")?.dataset.itemId;
                (globalThis as any).__gridClipboardDiagnostic.readinessSamples.push({ sourceId, columns, rowCount });
            };
            (globalThis as any).__sampleGridClipboardReadiness = sample;
            new MutationObserver(sample).observe(document.body, { childList: true, subtree: true });
        });
        const host = page.locator(".outliner-item").nth(1);
        await expect(host).toBeVisible();
        await host.click();
        const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await addDatabase.click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        const firstView = page.getByTestId("yjs-table-view").first();
        await expect(firstView).toBeVisible({ timeout: 30000 });
        // Capture this real source Grid before its source record is added. An
        // absent pre-creation page is deliberately not a readiness sample.
        await page.evaluate(() => (globalThis as any).__sampleGridClipboardReadiness());
        await firstView.getByTestId("yjs-table-add-row").click();

        const grid = firstView.getByTestId("yjs-table-grid");
        const expectedColumns = ["id", "title", "status", "priority", "due_date", "repeat_days"];
        await expect.poll(
            () =>
                grid.locator("thead th[data-col]").evaluateAll(headers =>
                    headers.map(header => header.getAttribute("data-col"))
                ),
            { timeout: 30000 },
        ).toEqual(expectedColumns);
        await expect(grid.locator("tbody tr")).toHaveCount(1, { timeout: 30000 });
        const sourceRecordId = await grid.locator("tbody tr").getAttribute("data-record-id");
        expect(sourceRecordId).toBeTruthy();

        const items = page.locator(".outliner-item[data-item-id]");
        const renderedHost = firstView.locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' outliner-item ') and @data-item-id][1]",
        );
        const hostId = await renderedHost.getAttribute("data-item-id");
        const sourceGridId = await page.evaluate(id =>
            [...(globalThis as any).generalStore.currentPage.items]
                .find((item: any) => item.id === id)?.yjsGridId, hostId);
        const itemIds = await items.evaluateAll(elements =>
            elements.map(element => element.getAttribute("data-item-id"))
        );
        const hostIndex = itemIds.indexOf(hostId);
        expect(hostIndex).toBeGreaterThan(0);
        const neighborId = itemIds[hostIndex - 1];
        const destinationId = await page.locator(".outliner-item[data-item-id]")
            .filter({ has: page.getByText("Paste below", { exact: true }) })
            .getAttribute("data-item-id");
        // A Grid node owns no outline text (#5015), so the selection ends at
        // offset 0 of its row - which is the whole block.
        const hostTextLength = 0;
        expect(hostId).toBeTruthy();
        expect(sourceGridId).toBeTruthy();
        expect(neighborId).toBeTruthy();
        expect(destinationId).toBeTruthy();
        const neighborText = await page.locator(`.outliner-item[data-item-id="${neighborId}"] .item-content`)
            .innerText();
        await recordGridClipboardDiagnostic(page, {
            sourceId: hostId,
            neighborId,
            destinationId,
            renderedColumns: expectedColumns,
            rowCount: 1,
        });
        await page.locator("textarea.global-textarea").focus();
        await page.evaluate(({ start, end, endOffset }) => {
            // eslint-disable-next-line no-restricted-globals
            const editor = window.editorOverlayStore!;
            editor.clearSelections();
            editor.setSelection({
                startItemId: start!,
                startOffset: 0,
                endItemId: end!,
                endOffset,
                userId: "local",
            });
        }, { start: neighborId, end: hostId, endOffset: hostTextLength });
        const preCopy = await page.evaluate(({ start, end }) => {
            const editor = (globalThis as any).editorOverlayStore;
            const selection = Object.values(editor.selections)[0] as any;
            return {
                selection,
                focus: document.activeElement?.matches("textarea.global-textarea") ?? false,
                valid: selection?.startItemId === start && selection?.startOffset === 0
                    && selection?.endItemId === end && selection?.endOffset === 0,
            };
        }, { start: neighborId, end: hostId });
        await recordGridClipboardDiagnostic(page, { selection: preCopy.selection, focus: preCopy.focus });
        expect(preCopy.valid).toBe(true);
        expect(preCopy.focus).toBe(true);
        const readinessSamples = await page.evaluate(() =>
            (globalThis as any).__gridClipboardDiagnostic.readinessSamples as Array<
                { sourceId?: string; columns: string[]; rowCount: number; }
            >
        );
        const sourceSamples = readinessSamples.filter(sample => sample.sourceId === hostId);
        const unreadyIndex = sourceSamples.findIndex(sample =>
            sample.columns.length !== expectedColumns.length || sample.rowCount !== 1
        );
        const readyIndex = sourceSamples.findIndex((sample, index) =>
            index > unreadyIndex && sample.rowCount === 1
            && sample.columns.join("\t") === expectedColumns.join("\t")
        );
        expect(unreadyIndex).toBeGreaterThanOrEqual(0);
        expect(readyIndex).toBeGreaterThan(unreadyIndex);
        await recordGridClipboardDiagnostic(page, { copyingReached: true });
        await page.keyboard.press("Control+c");
        // Outside Outliner a Grid is its rendered result: the header row of the
        // visible columns, not the table's display name.
        const expectedHeader = expectedColumns.join("\t");
        await expect.poll(() => readClipboardAndRecord(page))
            .toContain(`${neighborText}\n${expectedHeader}`);
        const copiedText = await readClipboardAndRecord(page);
        expect(copiedText).not.toContain("\nTasks");

        // Use the trusted browser paste event. The portable HTML payload is
        // independently round-tripped in itemClipboard.test.ts so this E2E
        // remains focused on the operating-system clipboard path.
        const target = page.locator(`.outliner-item[data-item-id="${destinationId}"]`);
        await target.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const occurrences = await page.evaluate(() =>
            [...(globalThis as any).generalStore.currentPage.items]
                .filter((item: any) => item.yjsGridId)
                .map((item: any) => ({ id: item.id, yjsGridId: item.yjsGridId }))
        );
        expect(occurrences).toHaveLength(2);
        const preservedSource = occurrences.find((item: any) => item.id === hostId);
        expect(preservedSource).toEqual({ id: hostId, yjsGridId: sourceGridId });
        const createdOccurrences = occurrences.filter((item: any) => item.id !== hostId);
        expect(createdOccurrences).toHaveLength(1);
        expect(createdOccurrences[0].id).not.toBe(hostId);
        expect(createdOccurrences[0].yjsGridId).toBe(sourceGridId);
        for (const view of await page.getByTestId("yjs-table-grid").all()) {
            await expect(view.locator("tbody tr")).toHaveCount(1, { timeout: 30000 });
            // The generated record ID is the authoritative identity of the
            // row. Comparing innerText here is incorrect because Playwright's
            // text matcher normalizes the tabs/newlines returned by innerText.
            await expect(view.locator("tbody tr")).toHaveAttribute("data-record-id", sourceRecordId!);
        }
    });

    test("copy and paste carries a Calendar's binding onto a fresh, text-less node", async ({ page }) => {
        const host = page.locator(".outliner-item").nth(1);
        // Node kinds are immutable (#5015): the block is created by the
        // slash command, not by converting this row.
        await createBlockFromItem(page, host, "Calendar");
        await page.getByTestId("calendar-name-input").fill("Release plan");
        await page.getByTestId("calendar-create").click();
        await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 30000 });

        // The Calendar is its own row now, created after the item the command
        // was typed in: index 1 is "Block host", index 2 the Calendar, index 3
        // "Neighbor". The copy spans all three, so the block travels with the
        // text around it.
        const items = page.locator(".outliner-item[data-item-id]");
        const start = await items.nth(1).getAttribute("data-item-id");
        const end = await items.nth(3).getAttribute("data-item-id");
        await page.locator("textarea.global-textarea").focus();
        await page.evaluate(({ start, end }) => {
            // eslint-disable-next-line no-restricted-globals
            const editor = window.editorOverlayStore!;
            editor.clearSelections();
            editor.setSelection({
                startItemId: start!,
                startOffset: 0,
                endItemId: end!,
                endOffset: 8,
                userId: "local",
            });
        }, { start, end });
        await page.keyboard.press("Control+c");
        // A block owns no outline text (#5015) and is given no caption to stand
        // in for it (#5024): other applications receive the selected text
        // around it, while the private payload below carries the binding.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toBe("Block host\nNeighbor");

        await page.locator(".outliner-item").last().locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("calendar-view")).toHaveCount(2, { timeout: 30000 });
        await expect(page.getByTestId("calendar-name").nth(1)).toHaveText("Release plan");
        // The pasted block is a Calendar node with no ordinary outline text.
        const pastedTexts = await page.evaluate(() =>
            [...(globalThis as any).generalStore.currentPage.items]
                .filter((item: any) => item.componentType === "calendar")
                .map((item: any) => String(item.text ?? ""))
        );
        expect(pastedTexts).toEqual(["", ""]);
    });
});
