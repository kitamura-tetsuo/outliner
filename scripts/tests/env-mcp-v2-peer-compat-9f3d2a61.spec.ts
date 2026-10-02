import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";
import {
    MCP_NODE,
    MCP_SERVER,
    checkMcpDependencyCompatibility,
} from "../mcp-dependency-compat-lib.mjs";

/** @feature ENV-9f3d2a61
 *  Title   : MCP v2 dependencies stay peer-compatible before CI fan-out
 *  Source  : docs/dev-features/env-mcp-v2-peer-compat-9f3d2a61.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

function fixture({ node = "2.1.0", server = "2.1.0", peer = "2.1.0", rootNode = node, rootServer = server } = {}) {
    const manifest = {
        dependencies: {
            [MCP_NODE]: node,
            [MCP_SERVER]: server,
        },
    };
    const lock = {
        packages: {
            "": {
                dependencies: {
                    [MCP_NODE]: rootNode,
                    [MCP_SERVER]: rootServer,
                },
            },
            [`node_modules/${MCP_NODE}`]: {
                version: node,
                peerDependencies: peer === undefined ? {} : { [MCP_SERVER]: peer },
            },
            [`node_modules/${MCP_SERVER}`]: {
                version: server,
            },
        },
    };
    return [JSON.stringify(manifest), JSON.stringify(lock)];
}

test("the repository's current MCP v2 graph passes through the production checker", () => {
    const output = execFileSync("node", ["scripts/check-mcp-dependency-compat.mjs"], {
        cwd: repoRoot,
        encoding: "utf-8",
    });
    expect(output).toMatch(/MCP v2 dependencies are compatible/);
});

test("the #5444 shape is rejected before npm ci fans out", () => {
    const result = checkMcpDependencyCompatibility(...fixture({
        node: "2.1.0",
        server: "2.2.0",
        peer: "2.1.0",
    }));
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/requires @modelcontextprotocol\/server@2\.1\.0/);
});

test("different package versions are allowed when the published peer range permits them", () => {
    const result = checkMcpDependencyCompatibility(...fixture({
        node: "2.1.0",
        server: "2.2.0",
        peer: "^2.1.0",
    }));
    expect(result.ok, result.problems.join("\n")).toBe(true);
});

test("a stale lockfile root declaration is rejected even when resolved versions look compatible", () => {
    const result = checkMcpDependencyCompatibility(...fixture({
        rootServer: "2.0.0",
    }));
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/package-lock\.json declares @modelcontextprotocol\/server@"2\.0\.0"/);
});

test("loss of the middleware peer contract fails closed for explicit review", () => {
    const result = checkMcpDependencyCompatibility(...fixture({
        peer: undefined,
    }));
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/does not publish a @modelcontextprotocol\/server peer dependency/);
});
