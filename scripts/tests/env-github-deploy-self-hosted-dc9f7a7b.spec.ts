import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-0007
 *  Title   : Deploy workflow runs on self-hosted runner
 *  Source  : docs/dev-features/env-github-deploy-self-hosted-dc9f7a7b.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const workflowFile = path.join(repoRoot, ".github", "workflows", "deploy.yml");

test("deploy workflow uses self-hosted runner and firebase deploy", () => {
    expect(fs.existsSync(workflowFile)).toBe(true);
    const workflow = fs.readFileSync(workflowFile, "utf-8");
    expect(workflow).toMatch(/runs-on:\s*self-hosted/);
    expect(workflow).toMatch(/actions\/checkout@v4/);
    expect(workflow).toMatch(/actions\/setup-node@v4/);
    expect(workflow).toMatch(/firebase deploy/);
});
