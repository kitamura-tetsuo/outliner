/**
 * ENV-7d41ae62: Every Playwright spec belongs to a project
 *
 * `client/playwright.config.ts` declares a top-level `testDir`, but every entry
 * in `projects[]` overrides it with its own `testDir`/`testMatch`. A spec file
 * that falls outside all of them is silently never collected and never run.
 *
 * This guard compares the spec files on disk against the files Playwright
 * actually collects and fails on any file no project picks up.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../");
const CLIENT = path.join(ROOT, "client");
const E2E = path.join(CLIENT, "e2e");

function findSpecFiles(dir: string, base = dir): string[] {
    const found: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            found.push(...findSpecFiles(full, base));
        } else if (entry.name.endsWith(".spec.ts")) {
            found.push(path.relative(base, full));
        }
    }
    return found.sort();
}

function collectListedSpecFiles(): string[] {
    const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pw-list-")), "list.json");
    execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], {
        cwd: CLIENT,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outFile },
        stdio: ["ignore", "ignore", "inherit"],
    });

    const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const files = new Set<string>();
    const walk = (suite: any) => {
        if (suite.file) files.add(suite.file);
        for (const spec of suite.specs ?? []) {
            if (spec.file) files.add(spec.file);
        }
        for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of report.suites ?? []) walk(suite);
    return [...files].sort();
}

describe("ENV-7d41ae62: Playwright project coverage", () => {
    it("collects every *.spec.ts under client/e2e", () => {
        const onDisk = findSpecFiles(E2E);
        expect(onDisk.length).toBeGreaterThan(0);

        const listed = new Set(collectListedSpecFiles());
        const uncollected = onDisk.filter(file => !listed.has(file));

        expect(
            uncollected,
            "These spec files are not collected by any Playwright project. "
                + "Move them into a project's testDir (and match its testMatch), "
                + "or add a project for their directory in client/playwright.config.ts:\n"
                + uncollected.map(f => `  client/e2e/${f}`).join("\n"),
        ).toEqual([]);
    }, 300_000);
});
