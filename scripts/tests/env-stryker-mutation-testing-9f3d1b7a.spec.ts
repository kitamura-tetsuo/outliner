import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-9f3d1b7a
 *  Title   : Enable Stryker mutation testing
 *  Source  : docs/dev-features/env-stryker-mutation-testing-9f3d1b7a.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const packageJsonFile = path.join(repoRoot, "client", "package.json");

test("client package.json has test:mutation script", () => {
    const content = fs.readFileSync(packageJsonFile, "utf-8");
    const packageJson = JSON.parse(content);
    expect(packageJson.scripts["test:mutation"]).toBeDefined();
});
