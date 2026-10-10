import { describe, expect, test } from "vitest";
import { runFirefoxProbe } from "./helpers/firefox-execution-fixture";

describe("Firefox execution evidence through the CI npm entrypoint", () => {
    test("records actual Firefox and a passed case with optional coverage disabled", () => {
        const result = runFirefoxProbe(`test('real Firefox', async ({ page }) => {
            await page.setContent('<button>Ready</button>');
            await expect(page.getByRole('button')).toHaveText('Ready');
        });`);
        expect(result.status, result.output).toBe(0);
        expect(result.evidence.status).toBe("passed");
        expect(result.evidence.mode).toBe("execution");
        expect(result.evidence.counts).toEqual({ collected: 1, executed: 1, passed: 1, attempts: 1 });
        expect(result.evidence.cases[0].diagnosticOutcome).toBe("passed");
        const runtime = result.evidence.cases[0].attempts[0].runtime;
        expect(runtime.engine).toBe("firefox");
        expect(runtime.version).toMatch(/^\d+\./);
        expect(runtime.playwrightVersion).toBe(result.evidence.playwrightVersion);
        expect(result.nativeReportExists).toBe(true);
    });

    test("propagates a failed assertion with first-attempt trace, screenshot and console", () => {
        const result = runFirefoxProbe(`test('deliberate failure', async ({ page }) => {
            await page.setContent('<button>Actual</button>');
            await page.evaluate(() => console.error('firefox-boundary-console-evidence'));
            await expect(page.getByRole('button')).toHaveText('Intentionally wrong');
        });`);
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.status).toBe("failed");
        const attempt = result.evidence.cases[0].attempts[0];
        expect(result.evidence.cases[0].diagnosticOutcome).toBe("assertion-failed");
        expect(attempt.status).toBe("failed");
        expect(attempt.retry).toBe(0);
        expect(attempt.attachments.map(attachment => attachment.name)).toEqual(expect.arrayContaining([
            "trace",
            "screenshot",
            "browser-console",
        ]));
        expect(attempt.errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(attempt.errors)).toContain("Intentionally wrong");
        for (const name of ["trace", "screenshot", "browser-console"]) {
            const attachment = result.retainedAttachments.find(item => item.name === name);
            expect(attachment?.exists).toBe(true);
            expect(attachment?.size).toBeGreaterThan(0);
        }
        expect(result.retainedAttachments.find(item => item.name === "browser-console")?.text)
            .toContain("firefox-boundary-console-evidence");
    });

    test.each([
        ["skip", "test.skip('omitted', async () => {});"],
        ["fixme", "test.fixme('omitted', async () => {});"],
        ["expected failure", "test('expected failure', async () => { test.fail(); expect(1).toBe(2); });"],
    ])("rejects %s instead of treating it as passing execution", (_name, body) => {
        const result = runFirefoxProbe(body);
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.status).toBe("failed");
        expect(result.evidence.counts.passed).toBe(0);
        expect(result.evidence.violations.length).toBeGreaterThan(0);
        expect(result.evidence.cases[0].diagnosticOutcome).toBe(
            _name === "expected failure" ? "expected-failure" : "skipped",
        );
        if (_name === "expected failure") {
            expect(result.evidence.cases[0].attempts[0].status).toBe("failed");
            for (const name of ["trace", "screenshot"]) {
                const file = result.retainedAttachments.find(item => item.name === name);
                expect(file?.exists).toBe(true);
                expect(file?.size).toBeGreaterThan(0);
            }
        }
    });

    test("rejects zero collection through the real CLI", () => {
        const result = runFirefoxProbe("export {};", { args: ["--pass-with-no-tests"] });
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.status).toBe("failed");
        expect(result.evidence.counts.collected).toBe(0);
    });

    test("missing Firefox fails before a page exists and retains launch error evidence", () => {
        const result = runFirefoxProbe(
            "test('requires a browser', async ({ page }) => { await page.goto('about:blank'); });",
            {
                missingBrowser: true,
            },
        );
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.status).toBe("failed");
        const attempt = result.evidence.cases[0].attempts[0];
        expect(result.evidence.cases[0].diagnosticOutcome).toBe("setup-or-launch-error");
        expect(attempt.runtime).toBeUndefined();
        expect(attempt.errors.length).toBeGreaterThan(0);
        expect(result.output).toMatch(/Executable doesn't exist|browserType.launch/);
    });

    test("listing never claims the collected case was executed", () => {
        const result = runFirefoxProbe(
            "test('listed only', async ({ page }) => { await page.goto('about:blank'); });",
            {
                args: ["--list"],
            },
        );
        expect(result.status, result.output).toBe(0);
        expect(result.evidence.mode).toBe("collection");
        expect(result.evidence.status).toBe("collection");
        expect(result.evidence.counts.executed).toBe(0);
    });

    test("rejects a passing subset of the fresh full-project inventory", () => {
        const result = runFirefoxProbe(
            `
            test('included case', async ({ page }) => { await page.setContent('<p>Ready</p>'); });
            test('omitted case', async ({ page }) => { await page.setContent('<p>Ready</p>'); });
        `,
            { inventory: "collect", args: ["--grep=included case"] },
        );
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.counts.expected).toBe(2);
        expect(result.evidence.counts.passed).toBe(1);
        expect(result.evidence.violations.join("\n")).toContain("Required case missing from execution");
    });

    test("a missing expected catalog cannot authorize a green full-suite result", () => {
        const result = runFirefoxProbe(
            "test('passes', async ({ page }) => { await page.setContent('<p>Ready</p>'); });",
            {
                inventory: "missing",
            },
        );
        expect(result.status, result.output).not.toBe(0);
        expect(result.evidence.violations.join("\n")).toContain("Cannot read the expected Firefox execution inventory");
    });

    test("console evidence survives a later teardown failure", () => {
        const result = runFirefoxProbe(`
            test.afterEach(async ({ page }) => {
                await page.evaluate(() => console.error('late-teardown-evidence'));
                throw new Error('deliberate teardown failure');
            });
            test('body passes', async ({ page }) => { await page.setContent('<p>Ready</p>'); });
        `);
        expect(result.status, result.output).not.toBe(0);
        expect(JSON.stringify(result.evidence.cases[0].attempts[0].errors)).toContain("deliberate teardown failure");
        expect(result.retainedAttachments.find(item => item.name === "browser-console")?.text)
            .toContain("late-teardown-evidence");
    });

    test("report persistence failure propagates through the actual CLI", () => {
        const result = runFirefoxProbe(
            "test('passes', async ({ page }) => { await page.setContent('<p>Ready</p>'); });",
            {
                unwritableReport: true,
            },
        );
        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("Failed to retain Firefox execution report");
    });
});
