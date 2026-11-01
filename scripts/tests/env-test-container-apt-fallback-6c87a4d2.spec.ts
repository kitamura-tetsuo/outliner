import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-6c87a4d2
 *  Title   : Test-container APT acquisition fails closed
 *  Source  : docs/dev-features/env-test-container-apt-fallback-6c87a4d2.yaml
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (...parts: string[]) => fs.readFileSync(path.join(repoRoot, ...parts), "utf8");

test("the image uses the bounded installer and CI runs its Docker regression", () => {
    const dockerfile = read(".github", "container", "Dockerfile");
    const workflow = read(".github", "workflows", "build-container.yml");
    const installer = read("scripts", "install-test-container-os-packages.sh");

    expect(dockerfile).toContain("/usr/local/bin/install-test-container-os-packages");
    expect(installer).toContain("Acquire::Retries=2");
    expect(installer).toContain("APT_ACQUISITION_BUDGET_SECONDS:-180");
    expect(installer).toContain("timeout --signal=TERM --kill-after=5");
    expect(installer).toContain("dpkg-query");
    expect(workflow).toContain("scripts/tests/test-container-os-packages.integration.sh");
    expect(workflow).toContain("docker run --rm outliner-test-container:ci");
});
