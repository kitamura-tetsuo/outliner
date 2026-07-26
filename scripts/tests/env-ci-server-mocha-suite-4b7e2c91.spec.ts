import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-4b7e2c91
 *  Title   : CI runs the server mocha suite
 *  Source  : docs/dev-features/env-ci-server-mocha-suite-4b7e2c91.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (...segments: string[]) => fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");

test("a dedicated workflow runs the server suite", () => {
    const workflow = read(".github", "workflows", "ci-test-server.yml");

    expect(workflow).toMatch(/workflow_call:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/uses: \.\/\.github\/actions\/setup-test-env/);
    expect(workflow).toMatch(/Run server tests/);
    expect(workflow).toMatch(/cd server\s+npm test/);
    expect(workflow).toMatch(/Summarise failures/);
    expect(workflow).toMatch(/upload-artifact/);
});

test("the CI entry workflow calls the server test workflow", () => {
    const ci = read(".github", "workflows", "ci.yml");

    expect(ci).toMatch(/uses: \.\/\.github\/workflows\/ci-test-server\.yml/);
});

test("the server test runner pins yjs to the server's node_modules", () => {
    const runner = read("scripts", "run-server-tests.sh");

    expect(runner).toMatch(/--loader \.\/tests\/loaders\/pin-server-deps\.mjs/);

    // shared/node_modules is symlinked to the client, so without this pin
    // server/src and the co-compiled shared/src load two Yjs instances.
    const loader = read("server", "tests", "loaders", "pin-server-deps.mjs");
    expect(loader).toMatch(/PINNED_SPECIFIERS = new Set\(\["yjs"\]\)/);
});
