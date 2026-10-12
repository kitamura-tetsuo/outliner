import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const client = path.resolve(import.meta.dirname, "../../../client");

interface ProbeOptions {
    missingBrowser?: boolean;
    args?: string[];
    inventory?: "collect" | "missing";
    unwritableReport?: boolean;
    entrypoint?: "npm" | "ci";
    previousPassingRun?: boolean;
}

/** Exercise the same npm/shell/config/reporter chain as CI using an isolated spec. */
export function runFirefoxProbe(body: string, options: ProbeOptions = {}) {
    const directory = fs.mkdtempSync(path.join(client, ".firefox-execution-probe-"));
    const report = path.join(directory, "execution.json");
    const nativeReport = path.join(directory, "playwright.json");
    const inventory = path.join(directory, "expected.json");
    const config = path.join(directory, "playwright.config.ts");
    const artifacts = path.join(directory, "results");
    fs.writeFileSync(
        path.join(directory, "probe.spec.ts"),
        `
import { test, expect } from '@playwright/test';
import { registerCoverageHooks } from '../e2e/utils/registerCoverageHooks';
registerCoverageHooks();
${body}
`,
    );
    fs.writeFileSync(
        config,
        `
import { defineConfig } from '@playwright/test';
import original from '../playwright.config';
import path from 'node:path';
const project = original.projects.find(project => project.name === 'firefox-selection-basic');
if (!project) throw new Error('The production Firefox selection project is missing');
export default defineConfig({
  ...original,
  reporter: original.reporter.map(entry => {
    const [name, ...options] = entry;
    return [name.startsWith('.') ? path.resolve(${JSON.stringify(client)}, name) : name, ...options];
  }),
  testDir: ${JSON.stringify(directory)},
  outputDir: ${JSON.stringify(artifacts)},
  retries: 0, workers: 1, timeout: 10000, expect: { timeout: 1000 },
  projects: [{ ...project, testDir: ${JSON.stringify(directory)}, testMatch: '*.spec.ts', testIgnore: [] }],
});
`,
    );
    const environment = {
        ...process.env,
        CI: "true",
        E2E_BROWSER: "firefox",
        E2E_PROJECT: "firefox-selection-basic",
        E2E_EXECUTION_ID: path.basename(directory),
        E2E_EXECUTION_REPORT: options.unwritableReport ? directory : report,
        E2E_EXPECTED_COLLECTION: options.inventory || options.entrypoint === "ci" ? inventory : "",
        PLAYWRIGHT_JSON_OUTPUT_NAME: nativeReport,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(directory, "html"),
        E2E_DISABLE_COVERAGE: "1",
        ...(options.missingBrowser ? { PLAYWRIGHT_BROWSERS_PATH: path.join(directory, "empty-cache") } : {}),
    };
    const args = ["run", "github:test:e2e", "--", `--config=${config}`, "--project=firefox-selection-basic"];
    if (options.inventory === "collect") {
        const collection = spawnSync("npm", [
            ...args,
            "--list",
            "--reporter=../scripts/tests/helpers/playwright-collection-reporter.mjs",
        ], {
            cwd: client,
            env: { ...environment, PLAYWRIGHT_COLLECTION_E2E_DIR: directory, PLAYWRIGHT_COLLECTION_OUTPUT: inventory },
            encoding: "utf8",
            timeout: 30000,
        });
        if (collection.status !== 0 || !fs.existsSync(inventory)) {
            throw new Error(`The production inventory failed: ${collection.stdout}\n${collection.stderr}`);
        }
    }
    const command = options.entrypoint === "ci" ? process.execPath : "npm";
    const invocation = options.entrypoint === "ci"
        ? [
            path.resolve(client, "../scripts/run-firefox-selection.mjs"),
            `--config=${config}`,
            "--project=firefox-selection-basic",
        ]
        : args;
    const invoke = (extra: string[] = []) =>
        spawnSync(command, [...invocation, ...extra], {
            cwd: client,
            env: environment,
            encoding: "utf8",
            timeout: 60000,
            maxBuffer: 4 * 1024 * 1024,
        });
    let previousEvidence;
    if (options.previousPassingRun) {
        const previous = invoke();
        if (previous.status !== 0) {
            fs.rmSync(directory, { recursive: true, force: true });
            throw new Error(`The preceding real Firefox execution failed: ${previous.stdout}\n${previous.stderr}`);
        }
        previousEvidence = JSON.parse(fs.readFileSync(report, "utf8"));
    }
    const result = invoke(options.args);
    const evidence = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, "utf8")) : undefined;
    const output = result.stdout + result.stderr;
    const nativeReportExists = fs.existsSync(nativeReport);
    const retainedAttachments = (evidence?.cases ?? []).flatMap(test => test.attempts).flatMap(attempt =>
        attempt.attachments.map(attachment => {
            const exists = !!attachment.path && fs.existsSync(attachment.path);
            return {
                name: attachment.name,
                exists,
                size: exists ? fs.statSync(attachment.path).size : 0,
                text: exists && attachment.contentType === "text/plain"
                    ? fs.readFileSync(attachment.path, "utf8")
                    : undefined,
            };
        })
    );
    fs.rmSync(directory, { recursive: true, force: true });
    return { ...result, output, evidence, previousEvidence, nativeReportExists, retainedAttachments };
}
