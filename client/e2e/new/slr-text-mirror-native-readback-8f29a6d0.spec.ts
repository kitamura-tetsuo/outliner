import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-8f29a6d0 — Genuine Text mirror changes remain effective. */
import { expect, type Page, test } from "@playwright/test";
import { pointInsideCharacter } from "../utils/selectionGeometryHelpers";
import { TestHelpers } from "../utils/testHelpers";
import { localSelectionEndpoints } from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

async function clickAtStart(page: Page, id: string) {
    const point = await pointInsideCharacter(page, id, 0);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press("Home");
    await expect(page.locator(".global-textarea")).toBeFocused();
}

async function nativeRange(page: Page, start: number, end: number) {
    await page.waitForTimeout(100);
    await page.locator(".global-textarea").evaluate((element, offsets) => {
        (element as HTMLTextAreaElement).setSelectionRange(offsets[0], offsets[1], "forward");
        // Use the real input surface and production document listener, as the
        // software-keyboard regressions do; never assign editor stores.
        document.dispatchEvent(new Event("selectionchange"));
    }, [start, end]);
    await page.waitForTimeout(200);
}

test("single-item native selection and collapse preserve the mirror and typing position", async ({ page }, info) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, info, ["Hello World"]);
    const id = await itemIdByText(page, "Hello World");
    await clickAtStart(page, id);
    await nativeRange(page, 0, 5);
    expect(await localSelectionEndpoints(page)).toEqual({
        start: { kind: "text", itemId: id, offset: 0 },
        end: { kind: "text", itemId: id, offset: 5 },
        isReversed: false,
    });
    await nativeRange(page, 5, 5);
    expect(await localSelectionEndpoints(page)).toBeUndefined();
    await expect(page.locator(".global-textarea")).toHaveValue("Hello World");
    await page.keyboard.type("!");
    await expect(page.locator(`[data-item-id="${id}"] .item-text`)).toHaveText("Hello! World");
});

for (const collapse of [false, true]) {
    test(
        `text-only cross-item mirror maps native ${collapse ? "collapse" : "narrowing"} to Omega offsets`,
        async ({ page }, info) => {
            test.setTimeout(120000);
            await seedSelectionPage(page, info);
            const alpha = await itemIdByText(page, "Alpha text");
            const omega = await itemIdByText(page, "Omega text");
            await clickAtStart(page, alpha);
            await page.keyboard.press("Shift+ArrowDown");
            await page.waitForTimeout(400);
            await expect(page.locator(".global-textarea")).toHaveValue("Alpha text\nOmega text");
            await nativeRange(page, collapse ? 14 : 13, collapse ? 14 : 15);
            if (collapse) {
                expect(await localSelectionEndpoints(page)).toBeUndefined();
                await page.keyboard.type("!");
                await expect(page.locator(`[data-item-id="${omega}"] .item-text`)).toHaveText("Ome!ga text");
            } else {
                expect(await localSelectionEndpoints(page)).toEqual({
                    start: { kind: "text", itemId: omega, offset: 2 },
                    end: { kind: "text", itemId: omega, offset: 4 },
                    isReversed: false,
                });
                await expect(page.locator(`[data-item-id="${omega}"] .item-text`)).toHaveText("Omega text");
            }
            await expect(page.locator(`[data-item-id="${alpha}"] .item-text`)).toHaveText("Alpha text");
        },
    );
}
