import { expect, test } from "@playwright/test";
import fs from "fs";

const stateFile = "/tmp/flaky-test-state.txt";

test("dummy flaky test", async ({ page }) => {
    const mode = process.env.FLAKY_TEST_MODE || "pass";

    if (mode === "flaky") {
        if (!fs.existsSync(stateFile)) {
            fs.writeFileSync(stateFile, "run1");
            console.log("First run, failing...");
            expect(true).toBe(false);
        } else {
            console.log("Second run, passing...");
            fs.unlinkSync(stateFile);
            expect(true).toBe(true);
        }
    } else if (mode === "fail") {
        console.log("Forced failure...");
        expect(true).toBe(false);
    } else {
        console.log("Forced success...");
        expect(true).toBe(true);
    }
});
