import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    expect,
    test,
} from "vitest";

/** @feature ENV-0008
 *  Title   : Functions load env via dotenvx
 */

test("functions env variables load with dotenvx", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = path.resolve(__dirname, "..", "..");

    const command = "node -e \"require('./index.js'); console.log(process.env.AZURE_TENANT_ID)\"";
    const output = execSync(command, {
        cwd: path.join(repoRoot, "functions"),
    })
        .toString()
        .trim()
        .split("\n")
        .pop();
    expect(output).toBe("test-tenant-id");
});

test("functions package.json lists dotenvx dependency", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = path.resolve(__dirname, "..", "..");
    const pkgPath = path.join(repoRoot, "functions", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies["@dotenvx/dotenvx"]).toBeDefined();
});
