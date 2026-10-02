import semver from "semver";

export const MCP_NODE = "@modelcontextprotocol/node";
export const MCP_SERVER = "@modelcontextprotocol/server";

const lockKey = pkg => `node_modules/${pkg}`;

export class McpDependencyCompatibilityInputError extends Error {}

function parseJson(text, label) {
    try {
        return JSON.parse(text);
    } catch {
        throw new McpDependencyCompatibilityInputError(`${label} is not valid JSON.`);
    }
}

function declaredDependency(manifest, pkg, problems) {
    const value = manifest?.dependencies?.[pkg];
    if (typeof value !== "string") {
        problems.push(`server/package.json must declare ${pkg} as a direct dependency.`);
        return undefined;
    }
    if (semver.validRange(value) === null) {
        problems.push(`server/package.json declares unsupported semver range ${pkg}@${JSON.stringify(value)}.`);
        return undefined;
    }
    return value;
}

function lockedDependency(lock, pkg, problems) {
    const entry = lock?.packages?.[lockKey(pkg)];
    if (!entry || typeof entry.version !== "string") {
        problems.push(`server/package-lock.json has no locked version for ${pkg}.`);
        return undefined;
    }
    if (semver.valid(entry.version) === null) {
        problems.push(`server/package-lock.json records invalid version ${pkg}@${JSON.stringify(entry.version)}.`);
        return undefined;
    }
    return entry;
}

/**
 * Validate the repository's direct MCP v2 middleware/server dependency graph.
 *
 * The decisive compatibility authority is the peer dependency published by the
 * locked @modelcontextprotocol/node package. Package numbers do not have to be
 * equal when that peer range explicitly permits a different server release.
 */
export function checkMcpDependencyCompatibility(manifestText, lockText) {
    const manifest = parseJson(manifestText, "server/package.json");
    const lock = parseJson(lockText, "server/package-lock.json");
    const problems = [];

    const declaredNode = declaredDependency(manifest, MCP_NODE, problems);
    const declaredServer = declaredDependency(manifest, MCP_SERVER, problems);
    const lockedNode = lockedDependency(lock, MCP_NODE, problems);
    const lockedServer = lockedDependency(lock, MCP_SERVER, problems);
    const lockRootDependencies = lock?.packages?.[""]?.dependencies;

    for (const [pkg, declared, locked] of [
        [MCP_NODE, declaredNode, lockedNode],
        [MCP_SERVER, declaredServer, lockedServer],
    ]) {
        if (declared !== undefined) {
            const lockDeclaration = lockRootDependencies?.[pkg];
            if (lockDeclaration !== declared) {
                problems.push(
                    `server/package-lock.json declares ${pkg}@${JSON.stringify(lockDeclaration)} at the root, `
                        + `but server/package.json declares ${JSON.stringify(declared)}.`,
                );
            }
        }
        if (declared !== undefined && locked !== undefined && !semver.satisfies(locked.version, declared)) {
            problems.push(
                `server/package-lock.json locks ${pkg}@${locked.version}, which does not satisfy `
                    + `server/package.json range ${JSON.stringify(declared)}.`,
            );
        }
    }

    const peerRange = lockedNode?.peerDependencies?.[MCP_SERVER];
    if (lockedNode !== undefined) {
        if (typeof peerRange !== "string") {
            problems.push(
                `The locked ${MCP_NODE}@${lockedNode.version} does not publish a ${MCP_SERVER} peer dependency; `
                    + "review the MCP compatibility policy before accepting this upstream contract change.",
            );
        } else if (semver.validRange(peerRange) === null) {
            problems.push(
                `The locked ${MCP_NODE}@${lockedNode.version} publishes unsupported `
                    + `${MCP_SERVER} peer range ${JSON.stringify(peerRange)}.`,
            );
        } else if (lockedServer !== undefined && !semver.satisfies(lockedServer.version, peerRange)) {
            problems.push(
                `${MCP_NODE}@${lockedNode.version} requires ${MCP_SERVER}@${peerRange}, `
                    + `but server/package-lock.json locks ${lockedServer.version}.`,
            );
        }
    }

    return {
        ok: problems.length === 0,
        problems,
        nodeVersion: lockedNode?.version,
        serverVersion: lockedServer?.version,
        serverPeerRange: typeof peerRange === "string" ? peerRange : undefined,
    };
}
