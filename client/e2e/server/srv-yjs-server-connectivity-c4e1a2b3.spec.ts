/** @feature SRV-c4e1a2b3
 *  Title   : Yjs server accepts WebSocket connection
 *  Source  : docs/client-features/srv-yjs-server-connectivity-c4e1a2b3.yaml
 */
import { expect, test } from "@playwright/test";

test.describe("Yjs server", () => {
    test("accepts WebSocket connection", async ({ page }) => {
        const port = process.env.VITE_YJS_PORT || "7093";

        // Navigate to the root page to ensure the test server is reachable
        await page.goto("/");

        // Attempt a simple WebSocket handshake
        await page.evaluate(port => {
            return new Promise<void>((resolve, reject) => {
                const ws = new WebSocket(`ws://localhost:${port}`);
                ws.onopen = () => {
                    ws.close();
                    resolve();
                };
                ws.onerror = () => reject(new Error("connection failed"));
            });
        }, port);

        expect(true).toBe(true);
    });
});
import "../utils/registerAfterEachSnapshot";
