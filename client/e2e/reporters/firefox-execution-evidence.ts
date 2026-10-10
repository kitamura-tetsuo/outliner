import type { TestCase, TestResult } from "@playwright/test/reporter";
import fs from "node:fs";
import path from "node:path";

export interface BrowserRuntime {
    engine: string;
    version: string;
    playwrightVersion: string;
    project: string;
}

export function browserRuntime(result: TestResult): BrowserRuntime | undefined {
    const attachment = result.attachments.find(item => item.name === "browser-runtime");
    if (!attachment) return;
    try {
        const text = attachment.body?.toString("utf8")
            ?? (attachment.path ? fs.readFileSync(attachment.path, "utf8") : "");
        return JSON.parse(text) as BrowserRuntime;
    } catch {
        // Invalid or missing evidence cannot count as an observed browser.
        return;
    }
}

export function attemptEvidence(result: TestResult) {
    return {
        retry: result.retry,
        workerIndex: result.workerIndex,
        parallelIndex: result.parallelIndex,
        startedAt: result.startTime.toISOString(),
        durationMs: result.duration,
        status: result.status,
        runtime: browserRuntime(result),
        errors: result.errors,
        stdout: result.stdout.map(chunk => chunk.toString()),
        stderr: result.stderr.map(chunk => chunk.toString()),
        attachments: result.attachments.map(({ name, contentType, path }) => ({ name, contentType, path })),
    };
}

export function expectedCollectionCount(): number | undefined {
    const inventoryPath = process.env.E2E_EXPECTED_COLLECTION;
    if (!inventoryPath) return;
    try {
        const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
        return Array.isArray(inventory.cases) ? inventory.cases.length : undefined;
    } catch {
        return;
    }
}

export type DiagnosticCaseOutcome =
    | "passed"
    | "assertion-failed"
    | "setup-or-launch-error"
    | "skipped"
    | "expected-failure"
    | "incomplete";

/** Normalize Playwright states into the outcomes required by the diagnostic contract. */
export function diagnosticCaseOutcome(test: TestCase): DiagnosticCaseOutcome {
    const last = test.results[test.results.length - 1];
    const annotations = [...test.annotations, ...(last?.annotations ?? [])];
    if (annotations.some(annotation => annotation.type === "fail") || test.expectedStatus === "failed") {
        return "expected-failure";
    }
    if (
        annotations.some(annotation => annotation.type === "skip" || annotation.type === "fixme")
        || test.expectedStatus === "skipped" || last?.status === "skipped"
    ) {
        return "skipped";
    }
    if (!last || last.workerIndex < 0 || last.status === "interrupted") return "incomplete";
    if (last.status === "passed") return "passed";
    if (
        !browserRuntime(last)
        && JSON.stringify(last.errors).match(/Executable doesn't exist|browserType\.launch|Failed to launch/i)
    ) {
        return "setup-or-launch-error";
    }
    return "assertion-failed";
}

/** Compare execution selection with the fresh, unfiltered project inventory. */
export function collectionViolations(tests: TestCase[], e2eDir: string): string[] {
    const inventoryPath = process.env.E2E_EXPECTED_COLLECTION;
    if (!inventoryPath) return [];
    try {
        const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
        if (!Array.isArray(inventory.cases) || inventory.cases.length === 0) {
            return ["The expected Firefox execution inventory is empty or invalid."];
        }
        const expected = new Set<string>(inventory.cases.map(item => {
            if (item.browser !== "firefox" || typeof item.file !== "string" || !Array.isArray(item.titles)) {
                throw new Error("The expected inventory contains an invalid Firefox case.");
            }
            return JSON.stringify([item.project, item.file, ...item.titles]);
        }));
        const actual = new Set(tests.map(test =>
            JSON.stringify([
                test.parent.project()?.name,
                path.relative(e2eDir, test.location.file).split(path.sep).join("/"),
                ...test.titlePath().slice(3),
            ])
        ));
        return [
            ...[...expected].filter(key => !actual.has(key)).map(key => `Required case missing from execution: ${key}`),
            ...[...actual].filter(key => !expected.has(key)).map(key => `Unexpected execution case: ${key}`),
        ];
    } catch (error) {
        return [`Cannot read the expected Firefox execution inventory: ${String(error)}`];
    }
}
