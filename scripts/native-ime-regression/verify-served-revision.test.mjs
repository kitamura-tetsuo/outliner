import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyServedRevision } from "./verify-served-revision.mjs";

for (const mode of ["matching", "reset-once", "reset", "hang", "hang-body", "wrong", "dirty"]) {
    test(`served revision: ${mode}`, async () => {
        const checkout = mkdtempSync(join(tmpdir(), "served-revision-"));
        const paths = ["components/GlobalTextArea.svelte", "lib/KeyEventHandler.ts", "components/EditorOverlay.svelte"];
        const git = (...args) => execFileSync("git", ["-C", checkout, ...args]);
        git("init", "--quiet");
        for (const path of paths) {
            mkdirSync(join(checkout, "client/src", path, ".."), { recursive: true });
            writeFileSync(join(checkout, "client/src", path), `committed ${path}\n`);
        }
        git("add", ".");
        git(
            "-c",
            "user.name=Verifier",
            "-c",
            "user.email=verifier@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "fixture",
        );
        if (mode === "dirty") writeFileSync(join(checkout, "client/src", paths[0]), "dirty");
        let requests = 0;
        const server = createServer((request, response) => {
            requests++;
            if (mode === "reset" || (mode === "reset-once" && requests === 1)) {
                request.socket.destroy();
                return;
            }
            if (mode === "hang") return;
            if (mode === "hang-body") {
                response.writeHead(200);
                response.write("export default ");
                return;
            }
            const path = request.url.slice("/src/".length).split("?")[0];
            const committed = `committed ${path}\n`;
            response.end(`export default ${JSON.stringify(mode === "wrong" ? "wrong" : committed)};\n`);
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        try {
            const output = join(checkout, "identity.json");
            const result = await verifyServedRevision(checkout, `http://127.0.0.1:${server.address().port}`, output, {
                requestTimeoutMs: 150,
                overallTimeoutMs: 5000,
                maxAttempts: 3,
            });
            assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), result);
            assert.equal(result.verified, ["matching", "reset-once"].includes(mode));
            if (mode === "reset-once") {
                assert.equal(result.attempts.length, 4);
                assert.ok(["UND_ERR_SOCKET", "ECONNRESET"].includes(result.attempts[0].error.code));
            }
            if (["reset", "hang", "hang-body"].includes(mode)) {
                assert.equal(result.failure.kind, "unavailable");
                assert.equal(result.attempts.length, 3);
                assert.ok(result.attempts.every(attempt => attempt.error && attempt.url && attempt.phase));
                assert.ok(result.elapsedMs < 7000);
            }
            if (["wrong", "dirty"].includes(mode)) assert.equal(result.failure.kind, "mismatch");
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
            rmSync(checkout, { recursive: true, force: true });
        }
    });
}
