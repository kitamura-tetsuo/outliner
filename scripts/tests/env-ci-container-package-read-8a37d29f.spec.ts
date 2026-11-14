import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** @feature ENV-8a37d29f
 * Source: docs/dev-features/env-ci-container-package-read-8a37d29f.yaml
 * Configuration regression only: actual pull/start/test execution is verified
 * independently in GitHub Actions, not inferred from this static test.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = (name: string) => parse(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));
const consumers = [
    ["ci-checks.yml", "lint"],
    ["ci-test-unit.yml", "unit-test"],
    ["ci-test-server.yml", "server-test"],
    ["ci-test-server.yml", "project-directory-test"],
    ["ci-test-integration.yml", "integration-test"],
];

describe("CI test container least-privilege package access", () => {
    it.each(consumers)("%s / %s explicitly grants package read after overriding permissions", (file, id) => {
        const job = workflow(file).jobs[id];
        expect(job.permissions.packages).toBe("read");
        expect(job.container.image).toBe("ghcr.io/${{ github.repository }}:latest");
        expect(job.container.credentials.password).toBe("${{ secrets.GITHUB_TOKEN }}");
    });

    it("keeps the approved producer namespace and normal caller permission", () => {
        const producer = workflow("build-container.yml");
        expect(producer.env.REGISTRY).toBe("ghcr.io");
        expect(producer.env.IMAGE_NAME).toBe("${{ github.repository }}");
        expect(producer.jobs["build-and-push"].permissions.packages).toBe("write");
        expect(workflow("ci.yml").permissions.packages).toBe("write");
    });
});
