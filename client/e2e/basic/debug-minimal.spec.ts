import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();
import { createRequire } from "module";
const require = createRequire(import.meta.url);

console.log("Resolving @playwright/test:", require.resolve("@playwright/test"));
console.log("Resolving playwright:", require.resolve("playwright"));

test.describe("Minimal Debug Test", () => {
    test("should pass", async ({ page }) => {
        await expect(page).not.toBeNull();
    });
});
