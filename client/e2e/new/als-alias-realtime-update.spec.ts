import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-REALTIME-UPDATE
 *  Title   : Alias indicator updates in realtime across clients
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("alias indicator updates in realtime across clients without polling", async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    page1.on("console", (msg) => console.log(`[PAGE1] ${msg.text()}`));

    await page1.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_E2E_TEST", "true");
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    });

    const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(
        page1,
        testInfo,
        [
            "TARGET AAA",
        ],
        undefined,
    );

    try {
        await page1.waitForFunction(() => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
            timeout: 20000,
        });
    } catch {
        console.log("YJS connection not established, continuing with test");
    }

    await TestHelpers.waitForOutlinerItems(page1, 2, 120000);

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    page2.on("console", (msg) => console.log(`[PAGE2] ${msg.text()}`));

    await page2.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_E2E_TEST", "true");
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    });

    await TestHelpers.seedProjectAndNavigate(
        page2,
        testInfo,
        [],
        undefined,
        { skipSeed: true, projectName, pageName },
    );

    try {
        await page2.waitForFunction(() => (globalThis as any).__YJS_STORE__?.getIsConnected?.() === true, null, {
            timeout: 30000,
        });
    } catch {
        console.log("YJS connection not established on page2");
    }

    await TestHelpers.waitForOutlinerItems(page2, 2, 120000);

    const targetId = await page1.evaluate(() => {
        const findIdByExactText = (text: string): string | null => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id] .item-text"));
            for (const n of nodes) {
                const t = (n.innerText || n.textContent || "").trim();
                if (t === text) {
                    return n.closest<HTMLElement>(".outliner-item[data-item-id]")?.dataset.itemId ?? null;
                }
            }
            return null;
        };
        return findIdByExactText("TARGET AAA");
    });

    expect(targetId).toBeTruthy();

    // Verify indicator is initially empty on page2
    await expect(page2.locator(`[data-item-id="${targetId}"] .referring-count`)).toBeHidden();

    // In client A (page1), add an alias pointing to TARGET AAA
    await page1.locator(`.outliner-item[data-item-id="${targetId}"] .item-content`).click({ force: true });
    await TestHelpers.waitForUIStable(page1);
    await page1.keyboard.press("Enter"); // create a new item below
    await TestHelpers.waitForUIStable(page1);

    await page1.keyboard.type("/alias");
    await page1.keyboard.press("Enter");
    await TestHelpers.waitForUIStable(page1);

    const newIndex = await page1.locator(".outliner-item").count() - 1;
    const aliasId = await TestHelpers.getItemIdByIndex(page1, newIndex);

    await page1.evaluate(({ aliasId, targetId }) => {
        const store: any = (globalThis as any).aliasPickerStore;
        if (store) {
            store.show(aliasId);
            store.confirmById(targetId);
        }
    }, { aliasId, targetId });

    // Expect the indicator to show 1 immediately without advancing timers (polling)
    await expect(page2.locator(`[data-item-id="${targetId}"] .referring-count`)).toHaveText("1", { timeout: 3000 });
});
