import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/** @feature ENV-5c8a1e64
 *  Title   : Every workflow job targets a runner that can be acquired
 *  Source  : docs/dev-features/env-workflow-runner-labels-resolvable-5c8a1e64.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const workflowDir = path.join(repoRoot, ".github", "workflows");

/** Images GitHub actually offers on the hosted pool. */
const HOSTED_IMAGES = [
    "ubuntu-latest",
    "ubuntu-24.04",
    "ubuntu-22.04",
    "ubuntu-24.04-arm",
    "ubuntu-22.04-arm",
    "windows-latest",
    "windows-2025",
    "windows-2022",
    "macos-latest",
    "macos-15",
    "macos-14",
    "macos-13",
];

interface RunsOn {
    job: string;
    labels: string[];
}

/**
 * Collect the `runs-on` of every job, in both the inline (`runs-on: ubuntu-latest`)
 * and the sequence form. Comment lines are dropped first, because a commented-out
 * `# - self-hosted` is exactly the regression this guard exists for.
 */
const collectRunsOn = (workflow: string): RunsOn[] => {
    const lines = workflow.split("\n");
    const found: RunsOn[] = [];
    let job = "<unknown>";

    for (let i = 0; i < lines.length; i++) {
        const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
        if (jobMatch) job = jobMatch[1];

        const inline = /^\s*runs-on:\s*(\S.*?)\s*(?:#.*)?$/.exec(lines[i]);
        if (inline) {
            const value = inline[1];
            if (value.startsWith("[")) {
                found.push({
                    job,
                    labels: value.replace(/^\[|\]$/g, "").split(",").map((l) => l.trim().replace(/^["']|["']$/g, ""))
                        .filter(Boolean),
                });
            } else {
                found.push({ job, labels: [value.replace(/^["']|["']$/g, "")] });
            }
            continue;
        }

        if (!/^\s*runs-on:\s*(?:#.*)?$/.test(lines[i])) continue;

        const labels: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
            const item = /^\s*-\s*(\S.*?)\s*(?:#.*)?$/.exec(lines[j]);
            if (item) {
                labels.push(item[1].replace(/^["']|["']$/g, ""));
                continue;
            }
            // Comment and blank lines belong to the block; anything else ends it.
            if (/^\s*(#.*)?$/.test(lines[j])) continue;
            break;
        }
        found.push({ job, labels });
    }

    return found;
};

const workflowFiles = fs.readdirSync(workflowDir)
    .filter((f) => /\.ya?ml(\.disabled)?$/.test(f))
    .sort();

test("the workflow directory is discoverable", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
});

describe.each(workflowFiles)("%s", (file) => {
    const workflow = fs.readFileSync(path.join(workflowDir, file), "utf-8");

    test("every job targets a runner GitHub can hand out", () => {
        const runsOn = collectRunsOn(workflow);
        // Reusable workflows are called by name, so a file without `runs-on` is fine.
        for (const { job, labels } of runsOn) {
            expect(labels.length, `${file}: ${job} has an empty runs-on`).toBeGreaterThan(0);

            // Expressions (matrix fan-out, reusable inputs) are resolved at run time.
            if (labels.some((l) => l.includes("${{"))) continue;

            // A self-hosted job is matched by its own labels, whatever they are.
            if (labels.includes("self-hosted")) continue;

            // Otherwise the job goes to the hosted pool, which only matches image names.
            // `[Linux, X64]` reaches nothing there and is killed with
            // "The job was not acquired by Runner of type hosted even after multiple attempts".
            expect(
                labels,
                `${file}: ${job} requests ${JSON.stringify(labels)}, which no hosted runner matches. `
                    + `Name a hosted image (${HOSTED_IMAGES[0]}) or add the self-hosted label.`,
            ).toEqual([expect.stringMatching(new RegExp(`^(${HOSTED_IMAGES.join("|")})$`))]);
        }
    });
});

test("the Stryker workflows no longer request the unmatched Linux/X64 pair", () => {
    for (const file of ["stryker-nightly.yml", "stryker-pr.yml.disabled"]) {
        const workflow = fs.readFileSync(path.join(workflowDir, file), "utf-8");
        expect(workflow, `${file} must name a hosted image`).toMatch(/runs-on: ubuntu-latest/);
        expect(workflow, `${file} must not keep the commented-out self-hosted label`).not.toMatch(
            /#\s*-\s*self-hosted/,
        );
    }
});
