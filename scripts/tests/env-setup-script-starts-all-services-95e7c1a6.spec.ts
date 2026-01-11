/** @feature ENV-0002
 *  Title   : Setup script starts all test services
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

test("setup script contains service startup commands", async () => {
    const content = fs.readFileSync(setupScript, "utf-8");
    expect(content.includes("pm2 start ecosystem.config.js")).toBe(true);
});
