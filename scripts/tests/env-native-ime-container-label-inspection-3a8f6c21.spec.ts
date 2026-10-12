/** @feature ENV-3a8f6c21 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync(
    path.resolve(import.meta.dirname, "../native-ime-regression/windows/start-backend.ps1"),
    "utf8",
);

describe("ENV-3a8f6c21: Windows native IME backend identity", () => {
    it("reads the revision inspected by the Compose startup session instead of opening another WSL session", () => {
        expect(script).toContain('Get-Content "$output/compose-build.stdout.txt"');
        expect(script).toContain("'^Image=.+ Source=[0-9a-f]{40}$'");
        expect(script).toContain("' Source=([0-9a-f]{40})$'");
        expect(script).not.toContain("docker inspect yjs-server");
        expect(script).not.toMatch(/^\$labels = .*docker ps --format/m);
    });

    it("fails closed unless exactly one inspected revision matches the evaluated checkout", () => {
        expect(script).toContain("if ($identityLines.Count -ne 1)");
        expect(script).toContain("if ($label -ne $sha)");
    });
});
