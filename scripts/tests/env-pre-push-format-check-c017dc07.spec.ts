import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    expect,
    test,
} from "vitest";

/** @feature ENV-0010
 *  Title   : Pre-push formatting check
 *  Source  : docs/dev-features/env-pre-push-format-check-c017dc07.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const script = path.join(repoRoot, "scripts", "pre_push.sh");

const tempFile = path.join(repoRoot, "temp_pre_push.ts");

function runScript(): number {
    try {
        execSync(script, { cwd: repoRoot, stdio: "pipe" });
        return 0;
    }
    catch (err) {
        return (err as any).status ?? 1;
    }
}

test("pre_push.sh exists and is executable", () => {
    expect(fs.existsSync(script)).toBe(true);
    const mode = fs.statSync(script).mode & 0o111;
    expect(mode).toBeGreaterThan(0);
});

test("pre_push.sh fails when formatting is incorrect", () => {
    fs.writeFileSync(tempFile, "const x=1\n");
    execSync(`git add ${tempFile}`, { cwd: repoRoot });
    const code = runScript();
    execSync(`git reset HEAD ${tempFile}`, { cwd: repoRoot });
    fs.unlinkSync(tempFile);
    expect(code).not.toBe(0);
});

test("pre_push.sh succeeds when formatting is correct", () => {
    fs.writeFileSync(tempFile, "const x = 1;\n");
    execSync(`npx --yes dprint fmt ${tempFile}`, { cwd: repoRoot });
    execSync(`git add ${tempFile}`, { cwd: repoRoot });
    const code = runScript();
    execSync(`git reset HEAD ${tempFile}`, { cwd: repoRoot });
    fs.unlinkSync(tempFile);
    expect(code).toBe(0);
});
