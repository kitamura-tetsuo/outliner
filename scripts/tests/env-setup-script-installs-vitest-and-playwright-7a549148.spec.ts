/** @feature ENV-0004
 *  Title   : Setup script installs vitest and playwright
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
const setupScript = path.join(repoRoot, "scripts", "codex-setup.sh");

function removeNodeModules(dir: string) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test.skip("codex-setup installs vitest and playwright", () => {
    const clientModules = path.join(repoRoot, "client", "node_modules");
    removeNodeModules(clientModules);

    execSync(`${setupScript}`, {
        cwd: repoRoot,
        env: { ...process.env, SKIP_SERVER_START: "1", SKIP_PORT_WAIT: "1" },
        stdio: "inherit",
    });

    expect(fs.existsSync(path.join(clientModules, ".bin", "vitest"))).toBe(true);
    expect(fs.existsSync(path.join(clientModules, ".bin", "playwright"))).toBe(true);
});
