/** @feature ENV-0e54d523
 *  Title   : Codex setup retries apt installs
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const setupScript = path.join(repoRoot, "scripts", "setup.sh");
const commonFunctions = path.join(repoRoot, "scripts", "common-functions.sh");

test("codex-setup uses retry_apt_get", () => {
    const content = fs.readFileSync(setupScript, "utf8");
    expect(content.includes("retry_apt_get -y install python3-venv python3-pip")).toBe(true);
});

test("retry_apt_get repairs dpkg state", () => {
    const content = fs.readFileSync(commonFunctions, "utf8");
    expect(content.includes("dpkg --configure -a")).toBe(true);
});
