import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-2f8c41d6
 *  Title   : Server container publish cancels superseded runs on main
 *  Source  : docs/dev-features/env-build-server-cancels-stale-runs-2f8c41d6.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (...segments: string[]) => fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");

test("the publish workflow still runs on pushes to main", () => {
    // The concurrency group must not change what triggers the workflow.
    const workflow = read(".github", "workflows", "build-server.yml");

    expect(workflow).toMatch(/on:\n {2}push:\n {4}branches:\n {6}- main\n/);
});

test("a newer commit on main cancels the in-progress publish run", () => {
    const workflow = read(".github", "workflows", "build-server.yml");

    // Grouping by workflow + ref puts every push to main in one group, and
    // cancel-in-progress makes the newest commit win, so an older image can
    // never finish and overwrite the `latest` tag.
    expect(workflow).toMatch(
        /^concurrency:\n {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m,
    );
});

test("the publish job still pushes the image tags", () => {
    // Cancelling stale runs must not disable publishing for the surviving run.
    const workflow = read(".github", "workflows", "build-server.yml");

    expect(workflow).toMatch(/push: true/);
    expect(workflow).toMatch(/yjs-ws-server:latest/);
});
