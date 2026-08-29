import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** @feature ENV-2e513660
 *  Title   : PR guards reject committed agent plan files
 *  Source  : docs/dev-features/env-pr-guards-reject-plan-files-2e513660.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const guardScript = path.join(repoRoot, "scripts/ci/pr-guards.sh");

/** Root-level plan-file spellings the debris guard rejects. */
const planFiles = [
    "plan.md",
    "plan.txt",
    "PLAN.md",
    "Plan.txt",
    "plans.md",
    "PLANS.txt",
    "plan_page-titles.md",
    "plan-2.txt",
    "plans_extra.md",
];

/** Root-level python files the debris guard rejects. */
const pythonFiles = [
    "verify.py",
    "verify2.py",
    "some_other_scratch.py",
    "test.py",
];

/** Runs the guard script against `cwd`. Without `base`, only the debris guard runs. */
const runGuards = (cwd: string, base = "") => {
    try {
        const stdout = execFileSync("bash", [guardScript], {
            cwd,
            encoding: "utf-8",
            env: { ...process.env, BASE_REF: "", PR_LABELS: "", BASE_COMMIT_OVERRIDE: base },
        });
        return { status: 0, output: stdout };
    } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string; };
        return { status: failure.status, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
};

describe("PR guards reject agent plan files", () => {
    let workspace: string;

    const track = (relative: string) => {
        const target = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "scratch\n");
        execFileSync("git", ["add", "-f", relative], { cwd: workspace });
    };

    beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pr-guards-plan-"));
        execFileSync("git", ["init", "-q"], { cwd: workspace });
        track("README.md");
    });

    afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    test.each([...planFiles, ...pythonFiles])("%s is rejected as debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("[debris]");
        expect(result.output).toContain(relative);
    });

    test.each([
        "docs/plan.md",
        "client/src/lib/planner.md",
        "explanation.md",
        "scripts/legitimate.py",
    ])("%s is kept: only root-level files are debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("no tracked debris files");
    });

    test("the repository tree carries no plan files", () => {
        const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf-8" })
            .split("\n")
            .filter(file => /^[Pp][Ll][Aa][Nn][Ss]?([_-][^/]*)?\.(md|txt)$/.test(file));

        expect(tracked).toEqual([]);
    });

    test("removing a debris-only base commit is not treated as an undone commit", () => {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: workspace, encoding: "utf-8" }).trim();

        git("config", "user.email", "guards@example.com");
        git("config", "user.name", "PR guards test");
        git("commit", "-qm", "base");
        track("plan.md");
        git("commit", "-qm", "feat: implementation that landed only plan.md");
        const base = git("rev-parse", "HEAD");
        fs.rmSync(path.join(workspace, "plan.md"));
        git("commit", "-qam", "ci: drop the committed plan file");

        const result = runGuards(workspace, base);

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("skipping debris-only base commit");
        expect(result.output).toContain("no undone base commits");
    });

    test("removing a real base commit is still reported as an undone commit", () => {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: workspace, encoding: "utf-8" }).trim();

        git("config", "user.email", "guards@example.com");
        git("config", "user.name", "PR guards test");
        git("commit", "-qm", "base");
        track("src/feature.ts");
        git("commit", "-qm", "feat: real implementation");
        const base = git("rev-parse", "HEAD");
        fs.rmSync(path.join(workspace, "src/feature.ts"));
        git("commit", "-qam", "chore: clobber the implementation");

        const result = runGuards(workspace, base);

        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("[revert] PR head has UNDONE base commit");
    });

    test.each([...planFiles, ...pythonFiles])(".gitignore keeps %s out of the working tree", relative => {
        // check-ignore answers for paths that do not exist, so nothing is written here.
        const ignored = execFileSync("git", ["check-ignore", "--no-index", relative], {
            cwd: repoRoot,
            encoding: "utf-8",
        }).trim();

        expect(ignored).toBe(relative);
    });

    test.each(["docs/plan.md", "README.md", "explanation.md", "scripts/legitimate.py"])(
        ".gitignore leaves %s tracked",
        relative => {
            expect(() => execFileSync("git", ["check-ignore", "--no-index", "-q", relative], { cwd: repoRoot }))
                .toThrow();
        },
    );
});
