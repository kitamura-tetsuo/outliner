import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

/** @feature ENV-a4c29f1e
 *  Title: Supported GitHub Actions majors
 *  Source: docs/dev-features/env-github-actions-supported-majors-a4c29f1e.yaml
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDirectory = path.join(root, ".github/workflows");
const actionDirectory = path.join(root, ".github/actions");

const supportedMajors: Record<string, number> = {
    "actions/cache": 6,
    "actions/checkout": 7,
    "actions/configure-pages": 6,
    "actions/deploy-pages": 5,
    "actions/download-artifact": 8,
    "actions/setup-java": 6,
    "actions/setup-node": 7,
    "actions/setup-python": 7,
    "actions/upload-artifact": 7,
    "actions/upload-pages-artifact": 5,
    "docker/build-push-action": 7,
    "docker/login-action": 4,
    "docker/metadata-action": 6,
    "docker/setup-buildx-action": 4,
    "getsentry/action-release": 3,
    "peter-evans/create-pull-request": 8,
};

const activeYamlFiles = [
    ...fs.readdirSync(workflowDirectory).filter((file) => /\.ya?ml$/.test(file))
        .map((file) => path.join(workflowDirectory, file)),
    ...fs.readdirSync(actionDirectory, { recursive: true })
        .filter((file) => typeof file === "string" && /(?:^|\/)action\.ya?ml$/.test(file))
        .map((file) => path.join(actionDirectory, file)),
];

function parseWorkflow(name: string): Record<string, any> {
    return YAML.parse(fs.readFileSync(path.join(workflowDirectory, name), "utf8"));
}

function findStep(workflow: Record<string, any>, job: string, name: string): Record<string, any> {
    const step = workflow.jobs[job].steps.find((candidate: Record<string, any>) => candidate.name === name);
    expect(step, `${job} must retain the ${name} step`).toBeDefined();
    return step;
}

function expectMultiFileArtifactArchive(step: Record<string, any>): void {
    expect(step.with.path.trim().split("\n").length, "the regression requires multiple evidence inputs")
        .toBeGreaterThan(1);
    expect(step.with.archive, "upload-artifact v7 requires archive mode for a named multi-file artifact").toBe(true);
}

describe("active external action references", () => {
    test.each(activeYamlFiles.map((file) => path.relative(root, file)))("%s uses the audited stable majors", (file) => {
        const source = fs.readFileSync(path.join(root, file), "utf8");
        expect(() => YAML.parse(source), `${file} must remain valid YAML`).not.toThrow();
        for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*$/gm)) {
            const reference = match[1];
            if (reference.startsWith("./")) continue;

            const versionMatch = /^(.+?)(?:\/(?:restore|save))?@v(\d+)$/.exec(reference);
            expect(versionMatch, `${file}: ${reference} must use an audited major tag`).not.toBeNull();
            const [, action, major] = versionMatch!;
            expect(supportedMajors[action], `${file}: ${action} is missing from the release audit`).toBeDefined();
            expect(Number(major), `${file}: ${reference} is not on the audited stable major`).toBe(
                supportedMajors[action],
            );
        }
    });
});

test("representative PR CI retains its trigger, permissions, guards, and failure propagation", () => {
    const workflow = parseWorkflow("ci.yml");

    expect(workflow.on.pull_request.types).toEqual(["opened", "synchronize", "reopened", "ready_for_review"]);
    expect(workflow.permissions).toEqual({
        actions: "write",
        contents: "write",
        packages: "write",
        "pull-requests": "write",
    });
    expect(workflow.jobs.format.needs).toBe("pr-guards");
    expect(workflow.jobs["unit-test"].needs).toContain("pr-guards");
    expect(workflow.jobs["unit-test"]["continue-on-error"]).toBeUndefined();
});

test("artifact and Pages deployment producers retain their consumer-facing contracts", () => {
    const e2e = parseWorkflow("ci-test-e2e.yml");
    const artifact = findStep(e2e, "e2e-test", "Upload Logs & Artifacts");
    expect(artifact.if).toBe("failure() || startsWith(matrix.project, 'firefox-')");
    expect(artifact.with.name).toBe(
        "e2e-artifacts-${{ env.E2E_BROWSER }}-${{ matrix.project }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expectMultiFileArtifactArchive(artifact);

    const incompatibleArtifact = structuredClone(artifact);
    incompatibleArtifact.with.archive = false;
    expect(() => expectMultiFileArtifactArchive(incompatibleArtifact)).toThrowError(
        "upload-artifact v7 requires archive mode for a named multi-file artifact",
    );

    const roundtripUpload = findStep(e2e, "artifact-roundtrip", "Upload representative E2E evidence");
    const roundtripDownload = findStep(e2e, "artifact-roundtrip", "Download representative E2E evidence");
    expectMultiFileArtifactArchive(roundtripUpload);
    expect(roundtripUpload.with.name).toBe(
        artifact.with.name
            .replace("${{ env.E2E_BROWSER }}", "firefox")
            .replace("${{ matrix.project }}", "artifact-roundtrip"),
    );
    expect(roundtripDownload.with.name).toBe(roundtripUpload.with.name);
    expect(findStep(e2e, "artifact-roundtrip", "Verify downloaded E2E evidence").run).toContain(
        "cmp artifact-roundtrip/source/runtime.log artifact-roundtrip/downloaded/runtime.log",
    );

    const pages = parseWorkflow("docs-deploy.yml");
    expect(findStep(pages, "build", "Upload artifact").with.path).toBe("docs/.vitepress/dist");
    expect(pages.jobs.deploy.needs).toBe("build");
    expect(findStep(pages, "deploy", "Deploy to GitHub Pages").id).toBe("deployment");
});

test("production deployment remains success-gated and Sentry upgrades do not mutate build output", () => {
    const workflow = parseWorkflow("deploy.yml");

    expect(workflow.on.workflow_run).toEqual({ branches: ["main"], types: ["completed"], workflows: ["CI"] });
    expect(workflow.jobs.deploy.if).toContain("github.event.workflow_run.conclusion == 'success'");
    for (
        const name of [
            "Create Sentry release (Client)",
            "Create Sentry release (Server)",
            "Create Sentry release (Functions)",
        ]
    ) {
        const step = findStep(workflow, "deploy", name);
        expect(step.uses).toBe("getsentry/action-release@v3");
        expect(step.with.inject).toBe(false);
    }
    expect(findStep(workflow, "deploy", "Deploy to Firebase").if).toBe("github.actor != 'dependabot[bot]'");
});
