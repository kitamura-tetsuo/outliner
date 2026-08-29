import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** @feature ENV-cf375343
 *  Title   : PR guards reject root-level Python files
 *  Source  : docs/dev-features/env-pr-guards-reject-root-python-cf375343.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const guardScript = path.join(repoRoot, "scripts/ci/pr-guards.sh");

/** Root-level python scripts the debris guard rejects. */
const pythonFiles = [
    "verify.py",
    "verify2.py",
    "arbitrary.py",
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

describe("PR guards reject root-level Python files", () => {
    let workspace: string;

    const track = (relative: string) => {
        const target = path.join(workspace, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "print('scratch')\n");
        execFileSync("git", ["add", "-f", relative], { cwd: workspace });
    };

    beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pr-guards-python-"));
        execFileSync("git", ["init", "-q"], { cwd: workspace });
        track("README.md");
    });

    afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    test.each(pythonFiles)("%s is rejected as debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).not.toBe(0);
        expect(result.output).toContain("[debris]");
        expect(result.output).toContain(relative);
    });

    test.each([
        "scripts/legit.py",
        "client/tests/test.py",
        "server/verify.py",
    ])("%s is kept: only root-level Python files are debris", relative => {
        track(relative);

        const result = runGuards(workspace);

        expect(result.status, result.output).toBe(0);
        expect(result.output).toContain("no tracked debris files");
    });

    test.each(pythonFiles)(".gitignore keeps %s out of the working tree", relative => {
        // check-ignore answers for paths that do not exist, so nothing is written here.
        const ignored = execFileSync("git", ["check-ignore", "--no-index", relative], {
            cwd: repoRoot,
            encoding: "utf-8",
        }).trim();

        expect(ignored).toBe(relative);
    });

    test.each(["scripts/legit.py", "README.md", "client/tests/test.py"])(
        ".gitignore leaves %s tracked",
        relative => {
            expect(() => execFileSync("git", ["check-ignore", "--no-index", "-q", relative], { cwd: repoRoot }))
                .toThrow();
        },
    );
});
