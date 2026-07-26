import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

test.describe("Service Worker Registration", () => {
    test("is disabled in E2E environment", async ({ page }) => {
        // Intercept service-worker.js requests
        const swRequests: string[] = [];
        page.on("request", (request) => {
            const url = request.url();
            if (url.includes("service-worker.js")) {
                swRequests.push(url);
            }
        });

        // E2E environment defaults to MODE="test". The flag in `env.ts` should return true.
        // Therefore, service worker registration shouldn't happen.
        await page.goto("/");
        await page.waitForLoadState("domcontentloaded");

        // Wait a bit to ensure registration would have been requested
        await page.waitForTimeout(2000);

        expect(swRequests.length).toBe(0);

        // Additionally, we can check for registrations via navigator API
        const swRegistrations = await page.evaluate(async () => {
            if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                return regs.length;
            }
            return 0;
        });

        expect(swRegistrations).toBe(0);
    });
});
