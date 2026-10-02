#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { checkMcpDependencyCompatibility } from "./mcp-dependency-compat-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "server", "package.json");
const lockPath = path.join(repoRoot, "server", "package-lock.json");

try {
    const result = checkMcpDependencyCompatibility(
        fs.readFileSync(manifestPath, "utf-8"),
        fs.readFileSync(lockPath, "utf-8"),
    );

    if (!result.ok) {
        console.error("MCP v2 dependency compatibility check failed:\n");
        for (const problem of result.problems) {
            console.error(`- ${problem}`);
        }
        console.error(
            "\nKeep @modelcontextprotocol/node and @modelcontextprotocol/server within the peer compatibility "
                + "declared by the locked middleware package. Do not bypass this with --force or --legacy-peer-deps.",
        );
        process.exit(1);
    }

    console.log(
        `MCP v2 dependencies are compatible: @modelcontextprotocol/node ${result.nodeVersion} `
            + `accepts @modelcontextprotocol/server ${result.serverPeerRange}; locked server is ${result.serverVersion}.`,
    );
} catch (error) {
    console.error(`MCP v2 dependency compatibility check could not run: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
}
