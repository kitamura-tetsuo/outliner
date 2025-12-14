import { expect, test } from "@playwright/test";

test.describe("dummy flaky test @flaky", () => {
    test("dummy flaky test", async ({ page }) => {
        const mode = process.env.FLAKY_TEST_MODE; // 'flaky', 'pass', 'fail'

        if (mode === "flaky") {
            const isFlaky = Math.random() > 0.5;
            console.log(`Flaky mode: ${isFlaky ? "failing" : "passing"}`);
            expect(isFlaky).toBe(false);
        } else if (mode === "fail") {
            console.log("Forced failure...");
            expect(true).toBe(false);
        } else {
            console.log("Forced success...");
            expect(true).toBe(true);
        }
    });
});
