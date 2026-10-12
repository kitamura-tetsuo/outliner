/** @feature ENV-3a8f6c21 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync(
    path.resolve(import.meta.dirname, "../native-ime-regression/windows/start-backend.ps1"),
    "utf8",
);

describe("ENV-3a8f6c21: Windows native IME backend identity", () => {
    it("reads revision labels from inspected container JSON instead of a cross-shell Go template", () => {
        expect(script).toContain("docker ps --quiet");
        expect(script).toContain("docker inspect @containerIds");
        expect(script).toContain('($containersJson -join "`n") | ConvertFrom-Json');
        expect(script).toContain("$_.Config.Labels.'org.opencontainers.image.revision'");
        expect(script).not.toMatch(/^\$labels = .*docker ps --format/m);
    });

    it("fails closed unless exactly one inspected revision matches the evaluated checkout", () => {
        expect(script).toContain("if ($label.Count -ne 1)");
        expect(script).toContain("if ($label -ne $sha)");
    });
});
