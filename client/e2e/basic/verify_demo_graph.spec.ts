import { expect, test } from "@playwright/test";

test("verify graph view for demo project", async ({ page }) => {
    const res = await page.goto("http://127.0.0.1:7090/demo/graph");
    console.log("Status:", res?.status());
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "demo_graph.png" });
});
