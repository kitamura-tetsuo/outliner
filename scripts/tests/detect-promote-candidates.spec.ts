import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Import functions from the detection script (ESM)
import { applyExclusions, generateOutput, identifyCandidates } from "../detect-promote-candidates.js";

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
});

describe("detect-promote-candidates.js unit tests", () => {
    it("excludes vendor and generated/test files", () => {
        const files = [
            "client/src/app.ts",
            "node_modules/pkg/index.js",
            "vendor/lib/util.js",
            "dist/app.js",
            "build/app.js",
            "client/src/components/Button.svelte",
            "client/src/test.spec.ts",
            "client/src/other.test.ts",
            "scripts/generated/file.ts",
            "scripts/tests/fixtures/sample.ts",
            "scripts/__tests__/dummy.ts",
        ];
        const filtered = applyExclusions(files);
        expect(filtered).toContain("client/src/app.ts");
        expect(filtered).toContain("client/src/components/Button.svelte");
        expect(filtered).not.toContain("node_modules/pkg/index.js");
        expect(filtered).not.toContain("vendor/lib/util.js");
        expect(filtered).not.toContain("dist/app.js");
        expect(filtered).not.toContain("client/src/test.spec.ts");
        expect(filtered).not.toContain("client/src/other.test.ts");
        expect(filtered).not.toContain("scripts/generated/file.ts");
        expect(filtered).not.toContain("scripts/tests/fixtures/sample.ts");
        expect(filtered).not.toContain("scripts/__tests__/dummy.ts");
    });

    it("identifyCandidates respects max-files and distributes per rule", () => {
        const now = Date.now();
        vi.spyOn(fs, "statSync").mockImplementation((p: any) =>
            ({
                mtime: new Date(now),
            }) as any
        );

        const rules = ["no-console", "no-debugger"]; // two rules
        const results = new Map<string, { violations: Map<string, number>; cleanRules: Set<string>; }>();
        // three files, all clean for both rules
        ["client/src/a.ts", "client/src/b.ts", "client/src/c.ts"].forEach((f) => {
            results.set(f, { violations: new Map(), cleanRules: new Set(rules) });
        });

        const { candidates, proposedChanges } = identifyCandidates(results, rules, 2);
        expect(candidates.length).toBe(2);
        // ensure proposedChanges split roughly across rules
        const filesNoConsole = proposedChanges["no-console"].files;
        const filesNoDebugger = proposedChanges["no-debugger"].files;
        expect(filesNoConsole.length + filesNoDebugger.length).toBeLessThanOrEqual(2);
    });

    it("generateOutput writes artifact with required fields", () => {
        const args = { rules: ["no-console"], maxFiles: 5, dryRun: true } as any;
        const candidates = [
            {
                file: "client/src/a.ts",
                rule: "no-console",
                currentStatus: "clean",
                lastModified: new Date().toISOString(),
                score: 10,
            },
        ];
        const proposedChanges = { "no-console": { files: ["client/src/a.ts"], severity: "error" } } as any;

        const artifact = generateOutput(args, candidates as any, proposedChanges);
        expect(fs.existsSync(artifact)).toBe(true);
        const data = JSON.parse(fs.readFileSync(artifact, "utf8"));
        expect(Array.isArray(data.candidates)).toBe(true);
        expect(Array.isArray(data.rules)).toBe(true);
        expect(typeof data.proposedChanges).toBe("object");
        fs.unlinkSync(artifact);
    });
});
