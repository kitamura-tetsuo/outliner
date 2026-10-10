/** @feature ENV-a31f98d4
 * Exercise the production Firefox CI command with the real Playwright runner.
 */
import { describe, expect, test } from "vitest";
import { runFirefoxProbe } from "./helpers/firefox-execution-fixture";

const passingCase = `test('actual Firefox case', async ({ page }) => {
    await page.setContent('<button>Ready</button>');
    await expect(page.getByRole('button')).toHaveText('Ready');
});`;

const run = (body: string, args: string[] = []) => runFirefoxProbe(body, { entrypoint: "ci", args });

describe("ENV-a31f98d4: Firefox CI requires complete execution evidence", () => {
    test("verifies fresh full-project inventory and actual passing Firefox execution", () => {
        const result = run(passingCase);
        expect(result.status, result.output).toBe(0);
        expect(result.evidence.mode).toBe("execution");
        expect(result.evidence.status).toBe("passed");
        expect(result.evidence.counts).toEqual({ expected: 1, collected: 1, executed: 1, passed: 1, attempts: 1 });
        expect(result.output).toContain("Verified 1 executed passing cases");
    });

    test("listing remains an inventory and cannot succeed through the CI command", () => {
        const listing = runFirefoxProbe(passingCase, { args: ["--list"] });
        expect(listing.status, listing.output).toBe(0);
        expect(listing.evidence.mode).toBe("collection");
        expect(listing.evidence.counts.executed).toBe(0);

        const result = run(passingCase, ["--list"]);
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.mode).toBe("collection");
        expect(result.output).toContain("Expected execution evidence, got collection");
    });

    test("a reporter override cannot leave a green invocation without execution evidence", () => {
        const result = run(passingCase, ["--reporter=line"]);
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence).toBeUndefined();
        expect(result.output).toContain("Cannot read the Firefox execution report");
    });

    test("a previous actual passing report cannot satisfy a later invocation", () => {
        const result = runFirefoxProbe(passingCase, {
            entrypoint: "ci",
            previousPassingRun: true,
            args: ["--reporter=line"],
        });
        expect(result.previousEvidence.status).toBe("passed");
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence).toBeUndefined();
        expect(result.output).toContain("Cannot read the Firefox execution report");
    }, 120000);

    test("a passing filtered case cannot stand in for the complete project", () => {
        const result = run(
            `${passingCase}\ntest('second required case', async ({ page }) => { await page.goto('about:blank'); });`,
            ["--grep=actual Firefox case"],
        );
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.counts.expected).toBe(2);
        expect(result.evidence.counts.passed).toBe(1);
        expect(result.output).toContain("Required case missing from execution");
    });

    test("assertion failure retains the failed attempt and reaches the command exit status", () => {
        const result = run(`test('deliberate failure', async ({ page }) => {
            await page.setContent('<p>Actual</p>');
            await page.evaluate(() => console.error('ci-entrypoint-console'));
            await expect(page.locator('p')).toHaveText('Wrong');
        });`);
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.cases[0].diagnosticOutcome).toBe("assertion-failed");
        for (const name of ["trace", "screenshot", "browser-console"]) {
            const attachment = result.retainedAttachments.find(item => item.name === name);
            expect(attachment?.exists).toBe(true);
            expect(attachment?.size).toBeGreaterThan(0);
        }
    });

    test.each([
        ["skip", "test.skip('omitted', async () => {});"],
        ["fixme", "test.fixme('omitted', async () => {});"],
        ["expected failure", "test('expected failure', async () => { test.fail(); expect(1).toBe(2); });"],
        ["zero collection", "export {};"],
    ])("%s cannot become a green full-project result", (_name, body) => {
        const result = run(body, ["--pass-with-no-tests"]);
        expect(result.status, result.output).not.toBe(0);
    });

    test("missing Firefox propagates a launch failure without runtime evidence", () => {
        const result = runFirefoxProbe(passingCase, { entrypoint: "ci", missingBrowser: true });
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.cases[0].diagnosticOutcome).toBe("setup-or-launch-error");
        expect(result.evidence.cases[0].attempts[0].runtime).toBeUndefined();
    });
});
