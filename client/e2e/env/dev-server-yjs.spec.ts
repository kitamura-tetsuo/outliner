import { expect, test } from "@playwright/test";

test.describe("Dev Server Environment", () => {
    test("loads only one instance of Yjs", async ({ page }) => {
        const yjsRequests: string[] = [];

        page.on("request", (request) => {
            const url = request.url();
            if (/\/node_modules\/\.vite\/deps\/yjs(-[a-zA-Z0-9_-]+)?\.js/.test(url)) {
                yjsRequests.push(url);
            }
        });

        const consoleErrors: string[] = [];
        page.on("console", (msg) => {
            if (msg.type() === "error") {
                consoleErrors.push(msg.text());
            }
        });

        await page.goto("/demo");

        // Wait for network idle or a specific element to load to ensure all requests are captured
        await page.waitForLoadState("networkidle");

        // Expect at most one Yjs chunk
        expect(yjsRequests.length).toBeLessThanOrEqual(1);

        // Expect no "Yjs was already imported" error
        const hasYjsError = consoleErrors.some(err => err.includes("Yjs was already imported"));
        expect(hasYjsError).toBeFalsy();
    });
});
