/** @feature ENV-0001
 *  Title   : Codex setup script is executable
 *  Source  : docs/client-features.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const setupScript = path.join(repoRoot, "scripts", "codex-setup.sh");
const filesReferencingSetup = [
    path.join(repoRoot, "scripts", "run-tests.sh"),
    path.join(repoRoot, "scripts", "augment-setup.sh"),
    path.join(repoRoot, ".devcontainer", "devcontainer.json"),
    path.join(repoRoot, ".github", "workflows", "test.yml"),
    path.join(repoRoot, "README.md"),
    path.join(repoRoot, "AGENTS.md"),
];

test("codex setup script has execute permission", async () => {
    expect(fs.existsSync(setupScript)).toBe(true);
    const mode = fs.statSync(setupScript).mode & 0o111;
    expect(mode).toBeGreaterThan(0);
});

test("all configuration references use codex-setup.sh", async () => {
    for (const file of filesReferencingSetup) {
        expect(fs.existsSync(file)).toBe(true);
        const content = fs.readFileSync(file, "utf-8");
        expect(content.includes("codex-setp.sh")).toBe(false);
        expect(content.includes("codex-setup.sh")).toBe(true);
    }
});
