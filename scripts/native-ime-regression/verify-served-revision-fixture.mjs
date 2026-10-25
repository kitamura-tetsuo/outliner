import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyServedRevision } from "./verify-served-revision.mjs";

export const paths = [
    "client/src/components/GlobalTextArea.svelte",
    "client/src/lib/KeyEventHandler.ts",
    "client/src/components/EditorOverlay.svelte",
];
export const committedByPath = Object.fromEntries(paths.map(path => [path, `committed ${path}\n`]));

export async function runFixture(mode, maxAttempts = 3) {
    const checkout = mkdtempSync(join(tmpdir(), "served-revision-"));
    const git = (...args) => execFileSync("git", ["-C", checkout, ...args]);
    git("init", "--quiet");
    for (const [path, committed] of Object.entries(committedByPath)) {
        mkdirSync(join(checkout, path, ".."), { recursive: true });
        writeFileSync(join(checkout, path), committed);
    }
    git("add", ".");
    git("-c", "user.name=Verifier", "-c", "user.email=verifier@example.invalid", "commit", "--quiet", "-m", "fixture");
    if (mode === "dirty") writeFileSync(join(checkout, paths[0]), "dirty");

    const transportObservations = [];
    const server = createServer((request, response) => {
        const path = `client${request.url.slice(0, request.url.indexOf("?"))}`;
        const reset = mode === "reset" || (mode === "reset-twice" && transportObservations.length < 2);
        transportObservations.push({ path, outcome: reset ? "reset" : "served" });
        if (reset) return request.socket.destroy();
        if (mode === "hang") return;
        if (mode === "hang-body") {
            response.writeHead(200);
            response.write("export default ");
            return;
        }
        const committed = committedByPath[path];
        response.end(`export default ${JSON.stringify(mode === "wrong" ? "wrong" : committed)};\n`);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const output = join(checkout, "identity.json");
        const result = await verifyServedRevision(checkout, `http://127.0.0.1:${server.address().port}`, output, {
            requestTimeoutMs: 150,
            overallTimeoutMs: 5000,
            maxAttempts,
        });
        assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), result);
        return { result, transportObservations };
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        rmSync(checkout, { recursive: true, force: true });
    }
}
