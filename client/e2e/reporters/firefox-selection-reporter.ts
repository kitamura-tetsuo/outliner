import type {
    FullConfig,
    FullResult,
    Reporter,
    Suite,
    TestCase,
    TestError,
    TestResult,
} from "@playwright/test/reporter";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { attemptEvidence, browserRuntime, collectionViolations } from "./firefox-execution-evidence";

const require = createRequire(import.meta.url);
const playwrightVersion: string = require("playwright/package.json").version;

/** A successful Firefox run must contain real, executed passing cases. */
export default class FirefoxSelectionReporter implements Reporter {
    private tests: TestCase[] = [];
    private errors: TestError[] = [];
    private active = false;
    private listing = process.argv.includes("--list");
    private startedAt = new Date().toISOString();
    private outputFile = path.resolve(
        process.env.E2E_EXECUTION_REPORT
            ?? `test-results/firefox-selection-${
                process.env.E2E_EXECUTION_ID ?? `${Date.now()}-${process.pid}`
            }.execution.json`,
    );
    private config?: FullConfig;
    private reportError?: string;

    printsToStdio() {
        return false;
    }

    onBegin(config: FullConfig, suite: Suite) {
        this.config = config;
        this.tests = suite.allTests().filter(test => test.parent.project()?.name.startsWith("firefox-selection-"));
        this.active = this.tests.length > 0 || process.env.E2E_BROWSER === "firefox";
        this.writeReport(this.listing ? "collection" : "running", []);
    }

    onError(error: TestError) {
        this.errors.push(error);
        this.active ||= process.env.E2E_BROWSER === "firefox";
        this.writeReport("failed", []);
    }

    onTestEnd(test: TestCase, _result: TestResult) {
        if (this.tests.includes(test)) this.writeReport("running", []);
    }

    async onEnd(result: FullResult) {
        if (!this.active) return;
        // Listing is a useful inventory, never execution evidence.
        if (this.listing) {
            this.writeReport("collection", [], result);
            return;
        }
        const violations = collectionViolations(this.tests, this.config?.rootDir ?? process.cwd());
        if (this.reportError) violations.push(this.reportError);
        if (this.tests.length === 0) violations.push("No Firefox selection cases were collected.");
        for (const test of this.tests) {
            const last = test.results[test.results.length - 1];
            const runtime = last && browserRuntime(last);
            const project = test.parent.project();
            const forbiddenAnnotation = [...test.annotations, ...(last?.annotations ?? [])]
                .some(annotation => ["skip", "fixme", "fail"].includes(annotation.type));
            if (
                test.expectedStatus !== "passed" || forbiddenAnnotation || last?.status !== "passed"
                || last.workerIndex < 0
            ) {
                violations.push(
                    `${test.titlePath().join(" > ")}: expected an executed passing result; got ${
                        last?.status ?? "not run"
                    }.`,
                );
            } else if (
                project?.use.browserName !== "firefox" || runtime?.engine !== "firefox"
                || !runtime.version?.trim() || runtime.playwrightVersion !== playwrightVersion
                || runtime.project !== project.name
            ) {
                violations.push(
                    `${test.titlePath().join(" > ")}: missing or mismatched actual Firefox runtime evidence.`,
                );
            }
        }
        const failed = result.status !== "passed" || this.errors.length > 0 || violations.length > 0;
        const saved = this.writeReport(failed ? "failed" : "passed", violations, result);
        if (failed || !saved) {
            for (const violation of violations) console.error(`[Firefox execution] ${violation}`);
            return { status: "failed" as const };
        }
    }

    private writeReport(status: string, violations: string[], result?: FullResult) {
        if (!this.active) return;
        const cases = this.tests.map(test => ({
            id: test.id,
            file: path.relative(this.config?.rootDir ?? process.cwd(), test.location.file),
            line: test.location.line,
            title: test.titlePath(),
            project: test.parent.project()?.name,
            configuredEngine: test.parent.project()?.use.browserName,
            expectedStatus: test.expectedStatus,
            outcome: test.outcome(),
            attempts: test.results.map(attemptEvidence),
        }));
        const attempts = cases.flatMap(test => test.attempts);
        try {
            fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
            fs.writeFileSync(
                this.outputFile,
                JSON.stringify(
                    {
                        schemaVersion: 1,
                        mode: this.listing ? "collection" : "execution",
                        executionId: process.env.E2E_EXECUTION_ID ?? `${this.startedAt}-${process.pid}`,
                        requestedProject: process.env.E2E_PROJECT,
                        engine: "firefox",
                        browserVersions: [...new Set(attempts.flatMap(attempt => attempt.runtime?.version ?? []))],
                        playwrightVersion,
                        startedAt: this.startedAt,
                        finishedAt: result ? new Date().toISOString() : undefined,
                        status,
                        runnerStatus: result?.status,
                        counts: {
                            collected: cases.length,
                            executed: cases.filter(test =>
                                test.attempts.some(attempt =>
                                    attempt.workerIndex >= 0 && attempt.status !== "skipped"
                                )
                            ).length,
                            passed: cases.filter(test =>
                                test.expectedStatus === "passed"
                                && test.attempts[test.attempts.length - 1]?.status === "passed"
                            ).length,
                            attempts: attempts.length,
                        },
                        violations,
                        errors: this.errors,
                        cases,
                    },
                    undefined,
                    2,
                ) + "\n",
            );
            return true;
        } catch (error) {
            this.reportError = `Failed to retain Firefox execution report: ${String(error)}`;
            console.error(this.reportError);
            return false;
        }
    }
}
