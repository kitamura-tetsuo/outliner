import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import YAML from "yaml";

/** @feature ENV-CI-SUPPORTED-NODE-LTS
 *  Title: Active CI workflows use supported Node.js LTS
 *  Source: docs/dev-features/env-ci-supported-node-lts-3edc9a14.yaml
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflows = [
    ".github/workflows/promote-eslint-candidates.yml",
    ".github/workflows/docs-deploy.yml",
    ".github/workflows/stryker-nightly.yml",
];

for (const workflow of workflows) {
    test(`${workflow} selects Node.js 24 for active jobs`, () => {
        const parsed = YAML.parse(fs.readFileSync(path.join(root, workflow), "utf8"));
        const jobs = Object.values(parsed.jobs ?? {}) as Array<
            { steps?: Array<{ uses?: string; with?: Record<string, unknown>; }>; }
        >;
        const versions = jobs.flatMap((job) =>
            (job.steps ?? [])
                .filter((step) => step.uses?.startsWith("actions/setup-node@"))
                .map((step) => String(step.with?.["node-version"] ?? ""))
        );
        expect(versions.length).toBeGreaterThan(0);
        expect(versions).toEqual(versions.map(() => "24"));
    });
}

test("Firebase Functions runtime is not changed by this migration", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "functions/package.json"), "utf8"));
    expect(String(pkg.engines.node)).toBe("22");
});
