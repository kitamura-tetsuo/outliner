/** @feature PRS-4d2e1b6a
 *  Title   : Yjs cursor presence sync
 *  Source  : docs/client-features/prs-yjs-presence-cursors-4d2e1b6a.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("PRS-4d2e1b6a: cursor presence", () => {
    test("propagates cursor between clients", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const projectId = `p-${Date.now()}`;
        const received = await page.evaluate(async pid => {
            // @ts-ignore
            const { createProjectConnection } = await import("/src/lib/yjs/connection.ts");
            // @ts-ignore
            const { Project } = await import("/src/schema/app-schema.ts");
            const c1 = await createProjectConnection(pid);
            const c2 = await createProjectConnection(pid);
            const project = Project.fromDoc(c1.doc);
            const p = project.addPage("P", "u1");
            await new Promise(r => setTimeout(r, 100));
            const pc1 = c1.getPageConnection(p.id)!;
            const pc2 = c2.getPageConnection(p.id)!;
            pc1.awareness.setLocalState({
                user: { userId: "u1", name: "A" },
                presence: { cursor: { itemId: "root", offset: 0 } },
            });
            await new Promise(r => setTimeout(r, 500));
            const states = pc2.awareness.getStates();
            return Array.from(states.values()).some((s: any) => s.presence?.cursor?.itemId === "root");
        }, projectId);
        expect(received).toBe(true);
    });
});
import "../utils/registerAfterEachSnapshot";
