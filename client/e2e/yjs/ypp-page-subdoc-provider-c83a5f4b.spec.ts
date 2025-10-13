import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YPP-c83a5f4b
 *  Title   : Page subdoc per-page provider
 *  Source  : docs/client-features/ypp-page-subdoc-provider-c83a5f4b.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Page subdoc provider", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("uses separate rooms and awareness for each page", async ({ page }) => {
        const projectId = `p-${Date.now()}`;
        const ids = await page.evaluate(async pid => {
            // @ts-ignore
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            // @ts-ignore
            const { Project } = await import("/src/schema/app-schema.ts");
            const conn = await createProjectConnection(pid);
            (window as any).__CONN__ = conn;
            const project = Project.fromDoc(conn.doc);
            const p1 = project.addPage("A", "u1");
            const p2 = project.addPage("B", "u1");
            return { p1: p1.id, p2: p2.id };
        }, projectId);
        await page.waitForFunction(({ p1, p2 }) => {
            const c = (window as any).__CONN__;
            return !!c.getPageConnection(p1) && !!c.getPageConnection(p2);
        }, ids);
        const rooms = await page.evaluate(({ p1, p2 }) => {
            const c = (window as any).__CONN__;
            return {
                r1: c.getPageConnection(p1).provider.roomname,
                r2: c.getPageConnection(p2).provider.roomname,
            };
        }, ids);
        expect(rooms.r1).not.toBe(rooms.r2);
        await page.evaluate(p1 => {
            const c = (window as any).__CONN__;
            c.getPageConnection(p1).awareness.setLocalStateField("presence", { cursor: { itemId: "a", offset: 0 } });
        }, ids.p1);
        const presence = await page.evaluate(({ p1, p2 }) => {
            const c = (window as any).__CONN__;
            return {
                p1: c.getPageConnection(p1).awareness.getLocalState().presence,
                p2: c.getPageConnection(p2).awareness.getLocalState()?.presence,
            };
        }, ids);
        expect(presence.p1).toBeTruthy();
        expect(presence.p2).toBeUndefined();
    });
});
