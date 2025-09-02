/** @feature SRV-fd3a7b21
 *  Title   : WebSocket sync updates between clients
 *  Source  : docs/client-features/srv-websocket-sync-updates-fd3a7b21.yaml
 */
import { expect, test } from "@playwright/test";
import WebSocket from "ws";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { TestHelpers } from "../utils/testHelpers";

test.describe("WebSocket document synchronization", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("updates from one client propagate to another", async () => {
        const port = process.env.TEST_API_PORT ?? "7091";
        const doc1 = new Y.Doc();
        const provider1 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc1, {
            params: { auth: "token1" },
            WebSocketPolyfill: WebSocket,
        });
        const doc2 = new Y.Doc();
        const provider2 = new WebsocketProvider(`ws://localhost:${port}`, "projects/testproj", doc2, {
            params: { auth: "token2" },
            WebSocketPolyfill: WebSocket,
        });
        await Promise.all([
            new Promise<void>(resolve => provider1.on("status", e => e.status === "connected" && resolve())),
            new Promise<void>(resolve => provider2.on("status", e => e.status === "connected" && resolve())),
        ]);

        doc1.getText("t").insert(0, "hi");
        await new Promise(resolve => doc2.once("update", () => resolve()));
        expect(doc2.getText("t").toString()).toBe("hi");

        provider1.destroy();
        provider2.destroy();
        doc1.destroy();
        doc2.destroy();
    });
});
