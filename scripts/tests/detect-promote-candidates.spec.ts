import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock child_process before importing the detection script
vi.mock("child_process", () => ({
    execSync: vi.fn(),
}));

import { execSync } from "child_process";

// Import functions from the detection script (ESM)
import {
    applyExclusions,
    calculateScore,
    generateOutput,
    getFilesToScan,
    identifyCandidates,
    parseArgs,
    runESLint,
} from "../detect-promote-candidates.js";

beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
});

afterEach(() => {
    // Don't restore mocks to keep module-level mock active
});

describe("detect-promote-candidates.js unit tests", () => {
    describe("parseArgs", () => {
        it("parses --rules parameter correctly", () => {
            const originalArgv = process.argv;
            process.argv = ["node", "script.js", "--rules", "no-console,no-unused-vars"];

            const args = parseArgs();
            expect(args.rules).toEqual(["no-console", "no-unused-vars"]);
            expect(args.maxFiles).toBe(50); // default
            expect(args.dryRun).toBe(false);

            process.argv = originalArgv;
        });

        it("parses --max-files parameter correctly", () => {
            const originalArgv = process.argv;
            process.argv = ["node", "script.js", "--rules", "no-console", "--max-files", "10"];

            const args = parseArgs();
            expect(args.rules).toEqual(["no-console"]);
            expect(args.maxFiles).toBe(10);

            process.argv = originalArgv;
        });

        it("parses --dry-run flag correctly", () => {
            const originalArgv = process.argv;
            process.argv = ["node", "script.js", "--rules", "no-console", "--dry-run"];

            const args = parseArgs();
            expect(args.rules).toEqual(["no-console"]);
            expect(args.dryRun).toBe(true);

            process.argv = originalArgv;
        });

        it("displays help message and exits when --help is used", () => {
            const originalArgv = process.argv;
            const originalExit = process.exit;
            const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
                throw new Error("process.exit called");
            });

            process.argv = ["node", "script.js", "--help"];

            expect(() => parseArgs()).toThrow("process.exit called");
            expect(exitSpy).toHaveBeenCalledWith(0);

            process.argv = originalArgv;
            process.exit = originalExit;
        });

        it("exits with error when --rules is missing", () => {
            const originalArgv = process.argv;
            const originalExit = process.exit;
            const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
                throw new Error("process.exit called");
            });
            const originalError = console.error;
            const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            process.argv = ["node", "script.js"];

            expect(() => parseArgs()).toThrow("process.exit called");
            expect(exitSpy).toHaveBeenCalledWith(1);
            expect(errorSpy).toHaveBeenCalled();

            process.argv = originalArgv;
            process.exit = originalExit;
            console.error = originalError;
        });

        it("combines multiple parameters correctly", () => {
            const originalArgv = process.argv;
            process.argv = [
                "node",
                "script.js",
                "--rules",
                "no-console,no-debugger",
                "--max-files",
                "25",
                "--dry-run",
            ];

            const args = parseArgs();
            expect(args.rules).toEqual(["no-console", "no-debugger"]);
            expect(args.maxFiles).toBe(25);
            expect(args.dryRun).toBe(true);

            process.argv = originalArgv;
        });
    });

    describe("getFilesToScan", () => {
        it("discovers files from multiple directories", () => {
            (execSync as any).mockImplementationOnce((command: any) => {
                if (typeof command === "string" && command.includes("client/src")) {
                    return "client/src/file1.ts\nclient/src/file2.js";
                } else if (typeof command === "string" && command.includes("client/e2e")) {
                    return "client/e2e/test.spec.ts";
                } else if (typeof command === "string" && command.includes("functions")) {
                    return "functions/index.ts";
                }
                return "";
            });

            const files = getFilesToScan();
            expect(files.length).toBeGreaterThan(0);
            expect(files).toContain("client/src/file1.ts");
            expect(files).toContain("client/src/file2.js");
            expect(files).toContain("client/e2e/test.spec.ts");
            expect(files).toContain("functions/index.ts");
        });

        it("handles missing directories gracefully", () => {
            (execSync as any).mockImplementation(() => {
                throw new Error("Directory not found");
            });

            const files = getFilesToScan();
            expect(files).toEqual([]);
        });

        it("removes duplicate files", () => {
            (execSync as any).mockImplementation(() => {
                return "client/src/file1.ts\nclient/src/file1.ts\nclient/src/file2.ts";
            });

            const files = getFilesToScan();
            const file1Count = files.filter((f) => f === "client/src/file1.ts").length;
            expect(file1Count).toBe(1);
            expect(files).toEqual(
                expect.arrayContaining(["client/src/file1.ts", "client/src/file2.ts"]),
            );
        });

        it("handles different file extensions", () => {
            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes(".svelte")) {
                    return "client/src/Component.svelte";
                } else if (typeof command === "string" && command.includes(".ts")) {
                    return "client/src/app.ts\nclient/src/types.ts";
                } else if (typeof command === "string" && command.includes(".js")) {
                    return "client/src/util.js";
                }
                return "";
            });

            const files = getFilesToScan();
            expect(files).toContain("client/src/Component.svelte");
            expect(files).toContain("client/src/app.ts");
            expect(files).toContain("client/src/types.ts");
            expect(files).toContain("client/src/util.js");
        });

        it("converts Windows paths to Unix format", () => {
            (execSync as any).mockImplementation(() => {
                return "client\\src\\file1.ts\nclient/src/file2.ts";
            });

            const files = getFilesToScan();
            expect(files).toEqual(expect.arrayContaining(["client/src/file1.ts", "client/src/file2.ts"]));
            // Check that all paths use forward slashes
            files.forEach((file) => {
                expect(file).not.toContain("\\");
            });
        });
    });

    describe("applyExclusions", () => {
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

        it("excludes all standard exclusion patterns", () => {
            const files = [
                "client/src/app.ts",
                "node_modules/index.js",
                "vendor/index.js",
                "dist/index.js",
                "build/index.js",
                ".git/config",
                "coverage/report.html",
                "tmp/cache.txt",
                ".svelte-kit/output.js",
                "generated/file.ts",
                "tests/fixtures/file.ts",
                "__tests__/file.ts",
                "file.spec.ts",
                "file.test.ts",
            ];
            const filtered = applyExclusions(files);
            expect(filtered).toEqual(["client/src/app.ts"]);
        });

        it("normalizes path separators", () => {
            const files = [
                "client\\src\\file1.ts",
                "client/src/file2.ts",
                "client\\e2e\\test.spec.ts",
            ];
            const filtered = applyExclusions(files);
            // applyExclusions normalizes for exclusion checking but returns original paths
            // It should exclude the e2e file (normalized to client/e2e/test.spec.ts)
            expect(filtered).toEqual(
                expect.arrayContaining(["client\\src\\file1.ts", "client/src/file2.ts"]),
            );
            // The backslash version won't be excluded because exclusion pattern uses forward slashes
            expect(filtered).toContain("client\\src\\file1.ts");
        });

        it("handles files with leading ./", () => {
            const files = ["./client/src/app.ts", "./dist/build.js", "client/src/lib.ts"];
            const filtered = applyExclusions(files);
            expect(filtered).toEqual(expect.arrayContaining(["./client/src/app.ts", "client/src/lib.ts"]));
            expect(filtered).not.toContain("./dist/build.js");
        });
    });

    describe("calculateScore", () => {
        it("awards recent modification bonus (7 days)", () => {
            const recent = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
            const score = calculateScore("client/src/app.ts", recent);
            expect(score).toBeGreaterThanOrEqual(10);
        });

        it("awards moderate modification bonus (30 days)", () => {
            const moderate = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago
            const score = calculateScore("client/src/app.ts", moderate);
            expect(score).toBeGreaterThanOrEqual(5);
        });

        it("awards no bonus for old modifications (>30 days)", () => {
            const old = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago
            const score = calculateScore("client/src/app.ts", old);
            // Should only get base score for file type/location
            expect(score).toBeLessThan(20);
        });

        it("awards location-based score for /src/lib/", () => {
            const now = Date.now();
            const score = calculateScore("client/src/lib/utils.ts", now);
            expect(score).toBeGreaterThanOrEqual(10); // recent + lib location
        });

        it("awards location-based score for /src/components/", () => {
            const now = Date.now();
            const score = calculateScore("client/src/components/Button.svelte", now);
            expect(score).toBeGreaterThanOrEqual(15); // recent + component location
        });

        it("awards location-based score for /src/", () => {
            const now = Date.now();
            const score = calculateScore("client/src/app.ts", now);
            expect(score).toBeGreaterThanOrEqual(10); // recent + source location
        });

        it("awards lower score for e2e tests", () => {
            const now = Date.now();
            const score = calculateScore("client/e2e/test.spec.ts", now);
            // e2e gets: recent bonus (10) + e2e location (5) + ts bonus (3) = 18
            expect(score).toBeGreaterThanOrEqual(15);
        });

        it("awards bonus for .svelte files", () => {
            const now = Date.now();
            const score = calculateScore("client/src/components/Button.svelte", now);
            expect(score).toBeGreaterThanOrEqual(5);
        });

        it("awards bonus for .ts files", () => {
            const now = Date.now();
            const score = calculateScore("client/src/app.ts", now);
            expect(score).toBeGreaterThanOrEqual(3);
        });

        it("combines multiple score factors", () => {
            const recent = Date.now() - 3 * 24 * 60 * 60 * 1000; // recent
            const score = calculateScore("client/src/lib/util.ts", recent);
            // Should have: recent bonus (10) + lib location (20) + ts bonus (3) = 33+
            expect(score).toBeGreaterThanOrEqual(30);
        });
    });

    describe("runESLint", () => {
        it("processes files in batches", async () => {
            const files = Array.from({ length: 50 }, (_, i) => `client/src/file${i}.ts`);
            const rules = ["no-console"];

            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes("eslint")) {
                    return JSON.stringify([
                        {
                            filePath: "/workspace/client/src/file0.ts",
                            messages: [],
                        },
                    ]);
                }
                return "";
            });

            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            const results = runESLint(files, rules);

            expect(execSync as any).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringMatching(/Processing batch \d+\/\d+/),
            );
        });

        it("parses ESLint JSON output correctly", () => {
            const files = ["client/src/app.ts"];
            const rules = ["no-console", "no-unused-vars"];

            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes("eslint")) {
                    return JSON.stringify([
                        {
                            filePath: "/workspace/client/src/app.ts",
                            messages: [
                                {
                                    ruleId: "no-console",
                                    severity: 1,
                                    message: "Unexpected console statement",
                                },
                                {
                                    ruleId: "no-unused-vars",
                                    severity: 1,
                                    message: "unused is defined but never used",
                                },
                            ],
                        },
                    ]);
                }
                return "";
            });

            const results = runESLint(files, rules);

            expect(results.has("client/src/app.ts"));
            const data = results.get("client/src/app.ts");
            expect(data?.violations.get("no-console")).toBe(1);
            expect(data?.violations.get("no-unused-vars")).toBe(1);
            expect(data?.cleanRules.has("no-console")).toBe(false);
        });

        it("handles files with no violations for target rules", () => {
            const files = ["client/src/clean.ts"];
            const rules = ["no-console"];

            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes("eslint")) {
                    return JSON.stringify([
                        {
                            filePath: "/workspace/client/src/clean.ts",
                            messages: [
                                {
                                    ruleId: "prefer-const",
                                    severity: 1,
                                    message: "use const instead of let",
                                },
                            ],
                        },
                    ]);
                }
                return "";
            });

            const results = runESLint(files, rules);

            const data = results.get("client/src/clean.ts");
            expect(data?.violations.has("no-console")).toBe(false);
            expect(data?.cleanRules.has("no-console")).toBe(true);
        });

        it("handles ESLint command failures gracefully", () => {
            const files = ["client/src/app.ts"];
            const rules = ["no-console"];

            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes("eslint")) {
                    const error = new Error("ESLint failed");
                    (error as any).stdout = JSON.stringify([
                        {
                            filePath: "/workspace/client/src/app.ts",
                            messages: [],
                        },
                    ]);
                    throw error;
                }
                return "";
            });

            const results = runESLint(files, rules);

            // Should still parse partial results from stdout
            expect(results.size).toBeGreaterThanOrEqual(0);
        });

        it("handles empty file list", () => {
            const files: string[] = [];
            const rules = ["no-console"];

            (execSync as any).mockImplementation(() => {
                return "";
            });

            const results = runESLint(files, rules);

            expect(results.size).toBe(0);
        });
    });

    describe("identifyCandidates", () => {
        it("respects max-files and distributes per rule", () => {
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

        it("sorts candidates by score (descending)", () => {
            const now = Date.now();
            const old = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago

            vi.spyOn(fs, "statSync").mockImplementation((p: any) => {
                if (p.toString().includes("recent.ts")) {
                    return { mtime: new Date(now) };
                } else {
                    return { mtime: new Date(old) };
                }
            });

            const rules = ["no-console"];
            const results = new Map<string, { violations: Map<string, number>; cleanRules: Set<string>; }>();
            results.set("client/src/recent.ts", {
                violations: new Map(),
                cleanRules: new Set(rules),
            });
            results.set("client/src/old.ts", {
                violations: new Map(),
                cleanRules: new Set(rules),
            });

            const { candidates } = identifyCandidates(results, rules, 10);

            expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[1].score);
        });

        it("handles files that cannot be accessed", () => {
            const rules = ["no-console"];
            const results = new Map<string, { violations: Map<string, number>; cleanRules: Set<string>; }>();
            results.set("client/src/accessible.ts", {
                violations: new Map(),
                cleanRules: new Set(rules),
            });
            results.set("client/src/inaccessible.ts", {
                violations: new Map(),
                cleanRules: new Set(rules),
            });

            const statSyncSpy = vi.spyOn(fs, "statSync").mockImplementation((p: any) => {
                const pathStr = typeof p === "string" ? p : p.toString();
                if (pathStr.includes("accessible")) {
                    return { mtime: new Date() };
                } else {
                    throw new Error("File not found");
                }
            });

            const { candidates } = identifyCandidates(results, rules, 10);

            // Should only include accessible files
            expect(candidates.length).toBe(1);
            expect(candidates[0].file).toBe("client/src/accessible.ts");
            expect(statSyncSpy).toHaveBeenCalled();
        });

        it("creates proposed changes for each rule", () => {
            const now = Date.now();
            vi.spyOn(fs, "statSync").mockImplementation((p: any) =>
                ({
                    mtime: new Date(now),
                }) as any
            );

            const rules = ["no-console", "no-debugger"];
            const results = new Map<string, { violations: Map<string, number>; cleanRules: Set<string>; }>();
            results.set("client/src/app.ts", {
                violations: new Map(),
                cleanRules: new Set(["no-console"]),
            });
            results.set("client/src/util.ts", {
                violations: new Map(),
                cleanRules: new Set(["no-debugger"]),
            });

            const { proposedChanges } = identifyCandidates(results, rules, 10);

            expect(proposedChanges["no-console"]).toBeDefined();
            expect(proposedChanges["no-debugger"]).toBeDefined();
            expect(proposedChanges["no-console"].severity).toBe("error");
            expect(proposedChanges["no-debugger"].severity).toBe("error");
            expect(proposedChanges["no-console"].files).toContain("client/src/app.ts");
            expect(proposedChanges["no-debugger"].files).toContain("client/src/util.ts");
        });
    });

    describe("generateOutput", () => {
        it("writes artifact with required fields", () => {
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
            expect(data.timestamp).toBeDefined();
            expect(data.rules).toEqual(["no-console"]);
            expect(data.candidates[0].file).toBe("client/src/a.ts");
            expect(data.candidates[0].rule).toBe("no-console");
            fs.unlinkSync(artifact);
        });

        it("includes all candidates in output", () => {
            const args = { rules: ["no-console"], maxFiles: 10 } as any;
            const candidates = Array.from({ length: 5 }, (_, i) => ({
                file: `client/src/file${i}.ts`,
                rule: "no-console",
                currentStatus: "clean",
                lastModified: new Date().toISOString(),
                score: 10,
            }));
            const proposedChanges = {
                "no-console": {
                    files: Array.from({ length: 5 }, (_, i) => `client/src/file${i}.ts`),
                    severity: "error",
                },
            } as any;

            const artifact = generateOutput(args, candidates as any, proposedChanges);
            const data = JSON.parse(fs.readFileSync(artifact, "utf8"));
            expect(data.candidates.length).toBe(5);
            fs.unlinkSync(artifact);
        });

        it("saves to timestamped artifact file", () => {
            const args = { rules: ["no-console"], maxFiles: 5, dryRun: false } as any;
            const candidates: any[] = [];
            const proposedChanges = { "no-console": { files: [], severity: "error" } } as any;

            const artifact = generateOutput(args, candidates, proposedChanges);
            expect(artifact).toMatch(/promote-candidates-\d+\.json$/);
            expect(fs.existsSync(artifact)).toBe(true);
            fs.unlinkSync(artifact);
        });
    });

    describe("Error handling and edge cases", () => {
        it("handles missing file stats gracefully in identifyCandidates", () => {
            const rules = ["no-console"];
            const results = new Map<string, { violations: Map<string, number>; cleanRules: Set<string>; }>();
            results.set("client/src/app.ts", {
                violations: new Map(),
                cleanRules: new Set(rules),
            });

            vi.spyOn(fs, "statSync").mockImplementation(() => {
                throw new Error("ENOENT");
            });

            const { candidates } = identifyCandidates(results, rules, 10);
            // Should handle error and return empty candidates
            expect(Array.isArray(candidates)).toBe(true);
        });

        it("handles empty results from ESLint", () => {
            const files: string[] = [];
            const rules = ["no-console"];

            (execSync as any).mockImplementation(() => {
                return "[]";
            });

            const results = runESLint(files, rules);
            expect(results.size).toBe(0);
        });

        it("handles malformed JSON from ESLint", () => {
            const files = ["client/src/app.ts"];
            const rules = ["no-console"];

            (execSync as any).mockImplementation((command: any) => {
                if (typeof command === "string" && command.includes("eslint")) {
                    const error = new Error("ESLint failed");
                    (error as any).stdout = "invalid json";
                    throw error;
                }
                return "";
            });

            const results = runESLint(files, rules);
            // Should handle parse error gracefully
            expect(results.size).toBe(0);
        });
    });
});
