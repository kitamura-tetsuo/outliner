import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";
import { parse } from "yaml";

/** @feature ENV-9f3d2a61
 *  Title   : MCP v2 dependencies stay peer-compatible before CI fan-out
 *  Source  : docs/dev-features/env-mcp-v2-peer-compat-9f3d2a61.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const read = (...segments: string[]) => fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");

test("Dependabot isolates MCP v2 middleware/server updates from the catch-all batch", () => {
    const config = parse(read(".github", "dependabot.yml"));
    const npm = config.updates.find((entry: { "package-ecosystem": string; }) => entry["package-ecosystem"] === "npm");
    const group = npm.groups["mcp-v2"];

    expect(group.patterns).toEqual([
        "@modelcontextprotocol/node",
        "@modelcontextprotocol/server",
    ]);
    expect(group["update-types"]).toEqual(["minor", "patch"]);

    const text = read(".github", "dependabot.yml");
    expect(text.indexOf("      mcp-v2:")).toBeLessThan(text.indexOf("      minor-and-patch:"));
});

test("a dedicated workflow runs the production compatibility checker", () => {
    const workflow = parse(read(".github", "workflows", "ci-mcp-dependency-compat.yml"));
    const steps = workflow.jobs["mcp-dependency-compat"].steps;
    const runs = steps.map((step: { run?: string; }) => step.run).filter(Boolean);

    expect(runs).toContain("npm ci --ignore-scripts --no-audit --no-fund");
    expect(runs).toContain("node scripts/check-mcp-dependency-compat.mjs");
});

test("dependency-heavy CI jobs cannot start before the MCP compatibility gate passes", () => {
    const ci = parse(read(".github", "workflows", "ci.yml"));
    expect(ci.jobs["mcp-dependency-compat"].uses).toBe("./.github/workflows/ci-mcp-dependency-compat.yml");

    for (const job of ["checks", "unit-test", "integration-test", "server-test", "e2e-test", "docker-build"]) {
        const needs = ci.jobs[job].needs;
        expect(Array.isArray(needs) ? needs : [needs], `${job} must depend on the MCP guard`).toContain(
            "mcp-dependency-compat",
        );
    }
});
