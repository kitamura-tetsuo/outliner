/** @feature ENV-0004
 *  Title   : E2E test scripts create log directory
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
const pkgPath = path.join(repoRoot, "client", "package.json");

interface PackageJson {
    scripts: Record<string, string>;
}

test("e2e scripts ensure log directory", async () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PackageJson;
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
        if (name.startsWith("test:e2e")) {
            expect(cmd).toContain("mkdir -p e2e/logs");
        }
    }
});
