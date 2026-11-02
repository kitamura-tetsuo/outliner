import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
assert.ok(root, "candidate checkout path is required");
function replaceExactly(file, from, to, count) {
    const target = path.join(root, file);
    const source = fs.readFileSync(target, "utf8");
    assert.equal(source.split(from).length - 1, count, `${file}: unexpected occurrences of ${from}`);
    fs.writeFileSync(target, source.replaceAll(from, to));
}
for (const file of ["server/Dockerfile", "server/Dockerfile.debug"]) {
    replaceExactly(file, "FROM node:24-bookworm-slim", "FROM node:26.13.0-bookworm-slim", 1);
}
replaceExactly("server/Dockerfile", "(cd server && npm ci)", "(cd server && npm ci --engine-strict)", 1);
replaceExactly("server/Dockerfile.debug", "RUN cd server && npm ci", "RUN cd server && npm ci --engine-strict", 1);
replaceExactly("Dockerfile.onprem", "FROM node:24-bookworm-slim", "FROM node:26.13.0-bookworm-slim", 3);
replaceExactly("Dockerfile.onprem", "RUN cd client && npm ci", "RUN cd client && npm ci --engine-strict", 1);
replaceExactly("Dockerfile.onprem", "&& cd server && npm ci", "&& cd server && npm ci --engine-strict", 1);
replaceExactly(
    "Dockerfile.onprem",
    "process.versions.node.split('.')[0]!=='24'",
    "process.versions.node!=='26.13.0'",
    1,
);
replaceExactly(
    "scripts/test-onprem-compose.sh",
    "process.versions.node.split('.')[0] !== '24'",
    "process.versions.node !== '26.13.0'",
    1,
);
replaceExactly("scripts/test-onprem-compose.sh", "Expected Node 24", "Expected Node 26.13.0", 1);
console.log("Prepared exact Node 26.13.0 candidate substitutions in", root);
