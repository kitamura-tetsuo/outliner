import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { prepareTwoFullBrowserPages } from "../../src/lib/yjs/testHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("Offline Sync Merge", () => {
    test("changes from both online and offline clients merge correctly on reconnect", async ({ browser }, testInfo) => {
        // Create initial project and navigate both contexts to it
        const { page1, page2, context1, context2 } = await prepareTwoFullBrowserPages(
            browser,
            testInfo,
            ["Initial item"],
            TestHelpers,
        );

        // Helper to get text from all items on the page
        async function getCurrentPageTexts(page: any): Promise<string[]> {
            return await page.evaluate(() => {
                try {
                    const gs = (globalThis as any).generalStore || (globalThis as any).appStore;
                    if (!gs?.currentPage?.items) return [];

                    const items = gs.currentPage.items as any[];
                    const texts: string[] = [];
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const text = item?.text?.toString?.() ?? String(item?.text ?? "");
                        texts.push(text);
                    }
                    return texts;
                } catch {
                    return [];
                }
            });
        }

        // Wait for both clients to be connected and synced
        async function waitForSync(page: any) {
            await page.waitForFunction(() => {
                const yjsStore = (globalThis as any).__YJS_STORE__;
                const client = yjsStore?.yjsClient;
                const provider = client?.wsProvider;
                return (provider as any)?.websocketProvider?.status === "connected" || provider?.isSynced === true;
            }, { timeout: 15000 });
        }

        await waitForSync(page1);
        await waitForSync(page2);

        // Verify initial state
        let texts1 = await getCurrentPageTexts(page1);
        let texts2 = await getCurrentPageTexts(page2);
        expect(texts1).toEqual(["Initial item"]);
        expect(texts2).toEqual(["Initial item"]);

        // 1. Take Context 2 (B) offline
        await context2.setOffline(true);
        console.log("Context 2 is now offline");

        // 2. In Context 1 (A), add an item "while B offline"
        await page1.evaluate(() => {
            const gs = (globalThis as any).generalStore;
            const items = gs.currentPage.items as any;
            const newItem = items.addNode("tester1");
            newItem.updateText("while B offline");
        });

        // 3. In Context 2 (B) (still offline), add an item "B was offline"
        await page2.evaluate(() => {
            const gs = (globalThis as any).generalStore;
            const items = gs.currentPage.items as any;
            const newItem = items.addNode("tester2");
            newItem.updateText("B was offline");
        });

        // Verify diverged states
        texts1 = await getCurrentPageTexts(page1);
        texts2 = await getCurrentPageTexts(page2);
        expect(texts1).toContain("while B offline");
        expect(texts1).not.toContain("B was offline");
        expect(texts2).toContain("B was offline");
        expect(texts2).not.toContain("while B offline");
        console.log("Context 1 state:", texts1);
        console.log("Context 2 state:", texts2);

        // 4. Bring Context 2 (B) back online
        await context2.setOffline(false);
        console.log("Context 2 is now online");

        // Wait for them to sync and converge
        // We need to wait for both texts to appear in both contexts
        await page1.waitForFunction(() => {
            try {
                const gs = (globalThis as any).generalStore || (globalThis as any).appStore;
                const items = gs?.currentPage?.items as any[];
                if (!items) return false;
                let found1 = false;
                let found2 = false;
                for (let i = 0; i < items.length; i++) {
                    const t = String(items[i]?.text ?? "");
                    if (t === "while B offline") found1 = true;
                    if (t === "B was offline") found2 = true;
                }
                return found1 && found2;
            } catch {
                return false;
            }
        }, { timeout: 15000 });

        await page2.waitForFunction(() => {
            try {
                const gs = (globalThis as any).generalStore || (globalThis as any).appStore;
                const items = gs?.currentPage?.items as any[];
                if (!items) return false;
                let found1 = false;
                let found2 = false;
                for (let i = 0; i < items.length; i++) {
                    const t = String(items[i]?.text ?? "");
                    if (t === "while B offline") found1 = true;
                    if (t === "B was offline") found2 = true;
                }
                return found1 && found2;
            } catch {
                return false;
            }
        }, { timeout: 15000 });

        // Final verification that they have converged
        const finalTexts1 = await getCurrentPageTexts(page1);
        const finalTexts2 = await getCurrentPageTexts(page2);

        console.log("Final Context 1 state:", finalTexts1);
        console.log("Final Context 2 state:", finalTexts2);

        expect(finalTexts1).toContain("while B offline");
        expect(finalTexts1).toContain("B was offline");
        expect(finalTexts2).toContain("while B offline");
        expect(finalTexts2).toContain("B was offline");

        // They should also be exactly equal arrays if order is resolved deterministically (which CRDTs do)
        // Order could depend on timestamp/client id depending on exact CRDT semantics for concurrent inserts
        // at the same index, but they MUST converge to the SAME array.
        expect(finalTexts1).toEqual(finalTexts2);

        await context1.close();
        await context2.close();
    });
});
