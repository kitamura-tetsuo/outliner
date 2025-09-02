import { expect, test } from "@playwright/test";

test("unauthenticated websocket is rejected", async () => {
    await new Promise<void>((resolve) => {
        const ws = new WebSocket("ws://localhost:3000");
        ws.onclose = (event) => {
            expect(event.code).toBe(4001);
            resolve();
        };
    });
});
