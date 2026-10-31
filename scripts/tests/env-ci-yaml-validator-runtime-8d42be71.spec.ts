import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import YAML from "yaml";

/** @feature ENV-8d42be71
 *  Title: Reproducible Python YAML validator runtime
 *  Source: docs/dev-features/env-ci-yaml-validator-runtime-8d42be71.yaml
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowPath = path.join(root, ".github/workflows/ci-yaml-tests.yml");
const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { force: true, recursive: true });
    }
});

function yamlValidationCommand(): string {
    const workflow = YAML.parse(fs.readFileSync(workflowPath, "utf8"));
    const step = workflow.jobs["check-yaml-tests"].steps.find(
        (candidate: { name?: string; }) => candidate.name === "Check YAML test references",
    );
    expect(step?.run).toBeTypeOf("string");
    return step.run;
}

function fixtureRepository(featureYaml: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-yaml-validator-"));
    temporaryDirectories.push(directory);
    const featureDirectory = path.join(directory, "docs/client-features");
    fs.mkdirSync(featureDirectory, { recursive: true });
    fs.writeFileSync(path.join(featureDirectory, "fixture.yaml"), featureYaml);
    return directory;
}

test("the workflow pins its Python and PyYAML versions", () => {
    const workflow = YAML.parse(fs.readFileSync(workflowPath, "utf8"));
    const steps = workflow.jobs["check-yaml-tests"].steps as Array<{
        name?: string;
        run?: string;
        with?: Record<string, string>;
    }>;

    expect(steps.find((step) => step.name === "Set up Python")?.with?.["python-version"]).toBe("3.13");
    expect(steps.find((step) => step.name === "Install PyYAML")?.run).toBe(
        "python -m pip install PyYAML==6.0.3",
    );
});

test("the workflow's validation command succeeds for valid YAML", () => {
    execFileSync("bash", ["-eo", "pipefail", "-c", yamlValidationCommand()], {
        cwd: fixtureRepository("id: FTR-12345678\ntests: []\n"),
        stdio: "pipe",
    });
});

test("the workflow's validation command propagates malformed YAML failure", () => {
    const result = spawnSync("bash", ["-eo", "pipefail", "-c", yamlValidationCommand()], {
        cwd: fixtureRepository("id: [unterminated\n"),
        encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("yaml.parser.ParserError");
});
