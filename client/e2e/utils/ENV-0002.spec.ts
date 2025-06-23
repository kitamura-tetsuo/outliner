/** @feature ENV-0002
 *  Title   : Setup script starts all test services
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

test("setup script contains service startup commands", async () => {
    const content = fs.readFileSync(setupScript, "utf-8");
    expect(content.includes("start_firebase_emulator")).toBe(true);
    expect(content.includes("start_tinylicious")).toBe(true);
    expect(content.includes("start_api_server")).toBe(true);
    expect(content.includes("start_sveltekit_server")).toBe(true);
});
