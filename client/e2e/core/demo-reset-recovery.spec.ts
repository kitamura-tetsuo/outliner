import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Demo reset recovery", () => {
    test("connected viewer recovers content without errors after reset", async ({ browser, context, page }) => {
        // viewerPage will just use the default page
        const viewerPage = page;

        // Catch console errors on viewer page
        const errors: string[] = [];
        viewerPage.on("pageerror", (err) => errors.push(err.message));
        viewerPage.on("console", (msg) => {
            if (msg.type() === "error") {
                errors.push(msg.text());
                console.log(msg.text());
            }
        });

        // Setup: Tab A opens demo page
        await viewerPage.goto("/demo");

        // Wait for page list
        const pageList = viewerPage.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 60000 });

        // Action: Tab B hits reset button via API to simulate concurrent reset
        const apiContext = await browser.newContext();
        const apiPage = await apiContext.newPage();
        await apiPage.goto("/demo");
        const resetResp = await apiPage.evaluate(async () => {
            const res = await fetch("/api/seed-demo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true }),
            });
            return await res.json();
        });
        expect(resetResp.success).toBe(true);
        expect(resetResp.reset).toBe(true);

        // Wait a moment for websocket broadcast
        await viewerPage.waitForTimeout(2000);

        // Verification: Tab A should automatically recover
        await expect(viewerPage.getByTestId("demo-page-list")).toBeVisible({ timeout: 60000 });

        // No ytree node lookup errors should be thrown
        const ytreeErrors = errors.filter(e =>
            e.includes("[ytree] node with key")
            || e.includes("Cannot read properties of undefined (reading 'children')")
        );
        console.log("Found YTree Errors:", ytreeErrors);
        expect(ytreeErrors.length).toBe(0);
        await apiContext.close();
    });
});
