import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

export interface CollectedCase {
    file: string;
    titles: string[];
    line: number;
    project: string;
    browser: string;
}

export interface Collection {
    projects: { name: string; browser: string; }[];
    cases: CollectedCase[];
}

const REPORTER = fileURLToPath(new URL("./playwright-collection-reporter.mjs", import.meta.url));

export function findSpecFiles(dir: string, base = dir): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "node_modules" ? [] : findSpecFiles(full, base);
        return entry.name.endsWith(".spec.ts") ? [path.relative(base, full).split(path.sep).join("/")] : [];
    }).sort();
}

// Intentionally independent of the project definitions: these paths are REQ-001.
export function requiredSelectionFiles(client: string): string[] {
    const e2e = path.join(client, "e2e");
    const files = ["basic/reproduce_issue_1512.spec.ts"];
    for (const directory of ["core", "new"]) {
        for (const file of fs.readdirSync(path.join(e2e, directory))) {
            if (/^slr-.*\.spec\.ts$/.test(file)) files.push(`${directory}/${file}`);
        }
    }
    const retained: unknown = JSON.parse(
        fs.readFileSync(path.join(client, "playwright-selection-retained.json"), "utf8"),
    );
    if (!Array.isArray(retained)) throw new Error("Retained selection paths must be an array");
    for (const file of retained) {
        if (
            typeof file !== "string" || file.startsWith("/") || file.split("/").includes("..")
            || !file.endsWith(".spec.ts")
        ) {
            throw new Error(`Invalid retained selection path: ${String(file)}`);
        }
        files.push(file);
    }
    for (const file of files) {
        if (!fs.existsSync(path.join(e2e, file))) throw new Error(`Required selection file is missing: ${file}`);
    }
    return [...new Set(files)].sort();
}

export function collectPlaywright(
    client: string,
    config = path.join(client, "playwright.config.ts"),
    invocation?: { project: string; browser: string; },
): Collection {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pw-collection-"));
    const output = path.join(temporary, "collection.json");
    const environment = { ...process.env };
    delete environment.E2E_BROWSER;
    delete environment.E2E_PROJECT;
    delete environment.E2E_EXPECTED_COLLECTION;
    try {
        execFileSync(process.execPath, [
            path.join(client, "node_modules/playwright/cli.js"),
            "test",
            `--config=${config}`,
            "--list",
            `--reporter=${REPORTER}`,
            ...(invocation ? [`--project=${invocation.project}`] : []),
        ], {
            cwd: client,
            env: {
                ...environment,
                CI: "true",
                NODE_ENV: "test",
                TEST_ENV: "localhost",
                PLAYWRIGHT_SINGLE_SPEC_RUN: "false",
                PLAYWRIGHT_COLLECTION_E2E_DIR: path.join(client, "e2e"),
                PLAYWRIGHT_COLLECTION_OUTPUT: output,
                ...(invocation ? { E2E_BROWSER: invocation.browser, E2E_PROJECT: invocation.project } : {}),
            },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 180_000,
            maxBuffer: 32 * 1024 * 1024,
        });
        return JSON.parse(fs.readFileSync(output, "utf8"));
    } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string; };
        throw new Error(`Playwright collection failed: ${failure.stderr || failure.stdout || failure.message}`);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

function caseKey(test: CollectedCase): string {
    return JSON.stringify([test.file, ...test.titles]);
}

function collectRequiredCases(client: string, files: string[]): CollectedCase[] {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pw-selection-inventory-"));
    const config = path.join(temporary, "playwright.config.mjs");
    try {
        // A separate actual collection bypasses production project grep/ignore rules.
        // Using the union of production projects would miss a case filtered in both engines.
        const matches = files.map(file => path.join(client, "e2e", file).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        fs.writeFileSync(
            config,
            `export default {
            testDir: ${JSON.stringify(path.join(client, "e2e"))},
            testMatch: [${matches.map(file => `new RegExp(${JSON.stringify(`^${file}$`)})`).join(",")}],
            forbidOnly: true,
            projects: [{ name: "selection-inventory", use: { browserName: "chromium" } }]
        };`,
        );
        return collectPlaywright(client, config).cases;
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

export function verifySelectionCoverage(
    client: string,
    e2eWorkflow: string,
    actual = collectPlaywright(client),
): void {
    const files = requiredSelectionFiles(client);
    const required = collectRequiredCases(client, files);
    const emptyFiles = files.filter(file => !required.some(test => test.file === file));
    if (emptyFiles.length) {
        throw new Error(`Required selection files contain no collected cases: ${emptyFiles.join(", ")}`);
    }
    if (!required.length) throw new Error("No required selection cases were collected");

    // CI sets these variables per shard. Re-list the relevant projects with the
    // same invocation context so an environment-conditional declaration cannot
    // disappear from both the execution and its expected collection catalog.
    const requiredFiles = new Set(files);
    const projects = actual.projects.filter(project =>
        actual.cases.some(test => test.project === project.name && requiredFiles.has(test.file))
    );
    const invoked = projects.flatMap(project =>
        collectPlaywright(client, undefined, { project: project.name, browser: project.browser }).cases
    );
    const requiredKeys = new Set(required.map(caseKey));
    for (const test of invoked) {
        if (requiredFiles.has(test.file) && !requiredKeys.has(caseKey(test))) {
            required.push(test);
            requiredKeys.add(caseKey(test));
        }
    }

    const failures: string[] = [];
    for (const browser of ["chromium", "firefox"]) {
        const collected = new Set(invoked.filter(test => test.browser === browser).map(caseKey));
        for (const test of required) {
            if (!collected.has(caseKey(test))) {
                failures.push(`Missing ${browser} collection: ${test.file}:${test.line} > ${test.titles.join(" > ")}`);
            }
        }
    }

    const document = parse(fs.readFileSync(e2eWorkflow, "utf8"));
    const matrix = document.jobs?.["e2e-test"]?.strategy?.matrix;
    if (!Array.isArray(matrix?.project) || matrix.project.some((value: unknown) => typeof value !== "string")) {
        throw new Error("Normal E2E CI must declare a project matrix");
    }
    // This workflow has one axis. Fail explicitly if its representation changes
    // rather than treating an unevaluated matrix expression as scheduled work.
    if (Object.keys(matrix).some(key => !["project", "include", "exclude"].includes(key))) {
        throw new Error("Cannot verify normal CI coverage for a matrix with additional axes");
    }
    const excluded = matrix.exclude ?? [];
    const included = matrix.include ?? [];
    for (const entries of [excluded, included]) {
        if (
            !Array.isArray(entries) || entries.some(entry =>
                !entry || typeof entry !== "object" || Array.isArray(entry)
                || Object.keys(entry).some(key => key !== "project")
                || ("project" in entry && typeof entry.project !== "string")
            )
        ) {
            throw new Error("Cannot verify normal CI matrix include/exclude entries");
        }
    }
    const scheduledProjects = new Set<string>(
        matrix.project.filter((project: string) =>
            !excluded.some((entry: { project?: string; }) => !entry.project || entry.project === project)
        ),
    );
    // GitHub applies include after exclude; an explicit include can restore a row.
    for (const entry of included) {
        if (entry.project) scheduledProjects.add(entry.project);
    }
    const scheduled = new Set(
        invoked.filter(test => test.browser === "firefox" && scheduledProjects.has(test.project)).map(caseKey),
    );
    const firefoxProjects = new Set(
        invoked.filter(test =>
            test.browser === "firefox" && requiredKeys.has(caseKey(test)) && !scheduled.has(caseKey(test))
        )
            .map(test => test.project),
    );
    for (const project of firefoxProjects) {
        if (!scheduledProjects.has(project)) failures.push(`Firefox project missing from normal CI matrix: ${project}`);
    }
    if (failures.length) throw new Error(failures.join("\n"));
}
