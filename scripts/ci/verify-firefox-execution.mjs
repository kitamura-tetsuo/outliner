import fs from "node:fs";

function readEvidence(file, description) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        throw new Error(`Cannot read ${description} at ${file}: ${String(error)}`);
    }
}

function caseIdentity(project, file, titles) {
    if (
        typeof project !== "string" || typeof file !== "string" || !Array.isArray(titles)
        || titles.length === 0 || titles.some(title => typeof title !== "string")
    ) {
        throw new Error("Firefox evidence contains an invalid case identity.");
    }
    return JSON.stringify([project, file.split("\\").join("/"), ...titles]);
}

/** Require fresh execution evidence after the npm process reports success. */
export function verifyFirefoxExecution({ inventoryFile, reportFile, project, executionId, playwrightVersion }) {
    const inventory = readEvidence(inventoryFile, "the expected Firefox inventory");
    const report = readEvidence(reportFile, "the Firefox execution report");
    const failures = [];
    if (!Array.isArray(inventory.cases) || inventory.cases.length === 0) {
        throw new Error("The expected Firefox inventory must contain at least one case.");
    }
    const expected = inventory.cases.map(test => {
        if (test.browser !== "firefox" || test.project !== project) {
            throw new Error(`The expected inventory does not belong to Firefox project ${project}.`);
        }
        return caseIdentity(test.project, test.file, test.titles);
    });
    const expectedKeys = new Set(expected);
    if (expectedKeys.size !== expected.length) failures.push("The expected inventory contains duplicate cases.");
    if (report.mode !== "execution") failures.push(`Expected execution evidence, got ${String(report.mode)}.`);
    if (report.status !== "passed" || report.runnerStatus !== "passed") {
        failures.push(`Firefox did not pass: report=${String(report.status)}, runner=${String(report.runnerStatus)}.`);
    }
    if (report.executionId !== executionId || report.requestedProject !== project) {
        failures.push("The execution report belongs to another invocation or project.");
    }
    if (
        report.engine !== "firefox" || report.playwrightVersion !== playwrightVersion
        || !Array.isArray(report.browserVersions) || report.browserVersions.length === 0
        || report.browserVersions.some(version => typeof version !== "string" || !version.trim())
    ) {
        failures.push("The report lacks actual Firefox and lockfile-matched Playwright version evidence.");
    }
    if (!Array.isArray(report.violations) || report.violations.length !== 0) {
        failures.push("The Firefox reporter recorded contract violations or omitted its verification result.");
    }
    if (!Array.isArray(report.cases)) throw new Error("The Firefox execution report has no case inventory.");
    const actual = report.cases.map(test => caseIdentity(test.project, test.file, test.title?.slice(3)));
    const actualKeys = new Set(actual);
    if (actualKeys.size !== actual.length) failures.push("The execution report contains duplicate cases.");
    for (const key of expectedKeys) {
        if (!actualKeys.has(key)) failures.push(`Required case missing from execution: ${key}`);
    }
    for (const key of actualKeys) {
        if (!expectedKeys.has(key)) failures.push(`Unexpected execution case: ${key}`);
    }
    for (const count of ["expected", "collected", "executed", "passed"]) {
        if (report.counts?.[count] !== expected.length) {
            failures.push(`Firefox ${count} count must be ${expected.length}; got ${String(report.counts?.[count])}.`);
        }
    }
    // Detailed skip/fixme/failure classification remains the reporter's responsibility.
    // Inspect the observed final browser for each case instead of trusting an engine label.
    for (const test of report.cases) {
        const last = test.attempts?.[test.attempts.length - 1];
        const runtime = last?.runtime;
        if (
            test.project !== project || test.configuredEngine !== "firefox" || test.diagnosticOutcome !== "passed"
            || last?.status !== "passed" || !(last.workerIndex >= 0)
            || runtime?.engine !== "firefox" || runtime.project !== project
            || typeof runtime.version !== "string" || !runtime.version.trim()
            || runtime.playwrightVersion !== playwrightVersion
        ) {
            failures.push(
                `Case lacks an executed passing Firefox result: ${String(test.file)} > ${test.title?.join(" > ")}`,
            );
        }
    }
    if (failures.length) throw new Error(failures.join("\n"));
    return {
        project,
        cases: expected.length,
        attempts: report.counts.attempts,
        browserVersions: report.browserVersions,
    };
}
