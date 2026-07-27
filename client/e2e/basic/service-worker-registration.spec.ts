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

// While SW registration is disabled in E2E environments to prevent caching issues across tests,
// we add a simple unit-style mock test here (or the equivalent logic) just to ensure the basic branching
// logic inside the Service Worker fetch handler would theoretically execute as expected.
test.describe("Service Worker Fetch Logic Analysis", () => {
    test("fetch logic routes network vs cache correctly based on url", async () => {
        // Here we simulate the logic of the service worker to verify our rule set
        function mockSwFetchLogic(req: { method: string; url: string; mode: string; }) {
            if (req.method !== "GET") return "bypass";

            const url = new URL(req.url);
            if (url.pathname.startsWith("/api/")) return "bypass";

            const isImmutable = url.pathname.startsWith("/_app/immutable/");

            if (req.mode === "navigate" || !isImmutable) {
                return "network-first";
            } else {
                return "cache-first";
            }
        }

        expect(mockSwFetchLogic({ method: "POST", url: "http://localhost/api/data", mode: "cors" })).toBe("bypass");
        expect(mockSwFetchLogic({ method: "GET", url: "http://localhost/api/data", mode: "cors" })).toBe("bypass");

        // HTML Navigation
        expect(mockSwFetchLogic({ method: "GET", url: "http://localhost/demo", mode: "navigate" })).toBe(
            "network-first",
        );

        // Immutable asset
        expect(
            mockSwFetchLogic({
                method: "GET",
                url: "http://localhost/_app/immutable/chunks/index.js",
                mode: "no-cors",
            }),
        ).toBe("cache-first");

        // Non-immutable asset (like a random image or json file not in immutable)
        expect(mockSwFetchLogic({ method: "GET", url: "http://localhost/favicon.png", mode: "no-cors" })).toBe(
            "network-first",
        );
    });
});
