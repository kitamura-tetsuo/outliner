import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    imeSession,
    insertDiagram,
    readSource,
    seedSource,
    setDemoResetting,
    undoDepth,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

const redoDepth = (page: Page) => page.evaluate(() => (globalThis as any).globalUndoRouter?.redoDepth ?? -1);
const refusals = (page: Page) => page.evaluate(() => (globalThis as any).__diagramRefusals.length as number);

async function recordRefusals(page: Page) {
    await page.evaluate(() => {
        (globalThis as any).__diagramRefusals = [];
        globalThis.addEventListener("diagram-edit-refused", event => {
            (globalThis as any).__diagramRefusals.push((event as CustomEvent).detail);
        });
    });
}

async function diagramWithSource(page: Page, source: string) {
    const created = await insertDiagram(page, page.locator(".outliner-item").nth(1));
    await seedSource(page, created.diagramId, source);
    await page.waitForTimeout(700);
    return created;
}

test.describe("FTR-5311a0cd: mutation preconditions cover whole commands and history replay", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        const otherPage = `other-page-${Date.now()}`;
        const { SeedClient } = await import("../utils/seedClient.js");
        const projectName = `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = `diagram-page-${Date.now()}`;
        await new SeedClient(projectName, await TestHelpers.getTestAuthToken()).seed([
            { name: otherPage, lines: ["other content"] },
            { name: pageName, lines: ["", "tail", `go [${otherPage}]`] },
        ]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, {
            projectName,
            pageName,
            doNotSeed: true,
        });
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 15000 });
        await recordRefusals(page);
    });

    test("a mixed Text/Diagram command is refused whole when the Diagram may not be written", async ({ page }) => {
        const { diagramId, occurrenceId } = await diagramWithSource(page, "ab");
        const tail = page.locator(".outliner-item", { hasText: "tail" });
        await tail.locator(".item-content").click({ force: true });
        await page.keyboard.press("End");
        await page.keyboard.down("Alt");
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.up("Alt");
        const depth = await undoDepth(page);

        await setDemoResetting(page, true);
        await page.keyboard.type("X");
        await expect.poll(() => refusals(page)).toBeGreaterThan(0);
        // Neither the Diagram nor the Text portion was applied.
        expect(await readSource(page, diagramId)).toBe("ab");
        await expect(tail.locator(".item-text")).toHaveText("tail");
        expect(await undoDepth(page)).toBe(depth);

        await setDemoResetting(page, false);
        await page.keyboard.type("Y");
        await expect.poll(() => readSource(page, diagramId)).toBe("Yab");
        await expect(tail.locator(".item-text")).toHaveText("tailY");
    });

    test("a refused Undo/Redo keeps its history entry; it succeeds once the surface is writable", async ({ page }) => {
        const { diagramId, occurrenceId } = await diagramWithSource(page, "ab");
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.press("Home");
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
        const depth = await undoDepth(page);

        await setDemoResetting(page, true);
        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(() => refusals(page)).toBeGreaterThan(0);
        expect(await readSource(page, diagramId)).toBe("Xab");
        expect(await undoDepth(page)).toBe(depth);
        await setDemoResetting(page, false);
        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");

        const redo = await redoDepth(page);
        await setDemoResetting(page, true);
        await page.getByRole("button", { name: "Redo" }).click();
        expect(await readSource(page, diagramId)).toBe("ab");
        expect(await redoDepth(page)).toBe(redo);
        await setDemoResetting(page, false);
        await page.getByRole("button", { name: "Redo" }).click();
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");
    });

    test("history replays from another writable page after the editing occurrence unmounted", async ({ page }) => {
        const { diagramId, occurrenceId } = await diagramWithSource(page, "ab");
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await page.keyboard.press("Home");
        await page.keyboard.type("X");
        await expect.poll(() => readSource(page, diagramId)).toBe("Xab");

        await page.locator("a.internal-link").first().click();
        await expect(page.locator(".outliner-item", { hasText: "other content" })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId("diagram-block")).toHaveCount(0);
        await page.getByRole("button", { name: "Undo" }).click();
        await expect.poll(() => readSource(page, diagramId)).toBe("ab");
    });

    test("on a read-only surface, paste and composition commits into source are refused", async ({ page }) => {
        const { diagramId, occurrenceId } = await diagramWithSource(page, "ab");
        await setDemoResetting(page, true);
        // Source inspection and caret placement still work on a read-only surface.
        await page.locator(`[data-item-id="${occurrenceId}"] [data-testid="diagram-block"]`).click();
        await expect(page.getByTestId("diagram-source")).toHaveText("ab");
        const depth = await undoDepth(page);

        await page.evaluate(() => {
            const data = new DataTransfer();
            data.setData("text/plain", "PASTED");
            document.querySelector("textarea.global-textarea")!
                .dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        });
        await expect.poll(() => refusals(page)).toBeGreaterThan(0);
        expect(await readSource(page, diagramId)).toBe("ab");

        const before = await refusals(page);
        const ime = await imeSession(page);
        await ime.compose("日");
        await ime.commit("日本");
        await expect.poll(() => refusals(page)).toBeGreaterThan(before);
        expect(await readSource(page, diagramId)).toBe("ab");
        expect(await undoDepth(page)).toBe(depth);
    });
});
