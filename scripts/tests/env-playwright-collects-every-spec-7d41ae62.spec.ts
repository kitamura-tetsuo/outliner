/** @feature ENV-7d41ae62
 * Every spec must be collected, and every required selection case must be
 * collected for both engines. Collection is not proof of test execution.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectPlaywright, findSpecFiles, verifySelectionCoverage } from "./helpers/playwright-collection";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENT = path.join(ROOT, "client");

describe("ENV-7d41ae62: Playwright project coverage", () => {
    it("collects every spec and every required selection case in both browser suites scheduled by CI", () => {
        const onDisk = findSpecFiles(path.join(CLIENT, "e2e"));
        expect(onDisk.length).toBeGreaterThan(0);
        const actual = collectPlaywright(CLIENT);
        const listed = new Set(actual.cases.map(test => test.file));
        const uncollected = onDisk.filter(file => !listed.has(file));
        expect(uncollected, "Spec files not collected by any Playwright project").toEqual([]);
        verifySelectionCoverage(
            CLIENT,
            path.join(ROOT, ".github/workflows/firefox-selection-diagnostic.yml"),
            actual,
        );
    }, 300_000);
});
