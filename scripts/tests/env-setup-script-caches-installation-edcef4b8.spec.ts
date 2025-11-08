/** @feature ENV-0003
 *  Title   : Setup script caches installation
 *  Source  : docs/dev-features.yaml
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const setupScript = path.join(repoRoot, "scripts", "setup.sh");
const sentinel = path.join(repoRoot, ".setup-installed");

test("setup script creates sentinel file", async () => {
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
}, 30000);

test("second run bypasses installation", async () => {
    const output = execSync(setupScript + " 2>&1", {
        cwd: repoRoot,
        env: {
            ...process.env,
            SKIP_SERVER_START: "1",
            SKIP_PORT_WAIT: "1",
        },
    }).toString();
    expect(output.includes("Skipping dependency installation")).toBe(true);
}, 30000);
