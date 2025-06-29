/** @feature ENV-0003
 *  Title   : Setup script caches installation
 *  Source  : docs/dev-features.yaml
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    expect,
    test,
} from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const setupScript = path.join(repoRoot, "scripts", "codex-setup.sh");
const sentinel = path.join(repoRoot, ".codex-setup-installed");

test.skip("setup script creates sentinel file", async () => {
    // Skipped in Codex environment due to Playwright installation failure
    if (fs.existsSync(sentinel)) fs.unlinkSync(sentinel);
    execSync(setupScript, {
        cwd: repoRoot,
        env: {
            ...process.env,
            SKIP_SERVER_START: "1",
            SKIP_PORT_WAIT: "1",
        },
        stdio: "inherit",
    });
    expect(fs.existsSync(sentinel)).toBe(true);
});

test.skip("second run bypasses installation", async () => {
    // Skipped in Codex environment due to Playwright installation failure
    const output = execSync(setupScript + " 2>&1", {
        cwd: repoRoot,
        env: {
            ...process.env,
            SKIP_SERVER_START: "1",
            SKIP_PORT_WAIT: "1",
        },
    }).toString();
    expect(output.includes("Skipping dependency installation")).toBe(true);
});
