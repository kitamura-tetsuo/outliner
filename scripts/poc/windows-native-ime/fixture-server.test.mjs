import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("fixture telemetry resets only on registered navigation and rejects retired sessions", async () => {
    const output = mkdtempSync(join(tmpdir(), "native-ime-"));
    const child = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url)), output]);
    try {
        let ready = false;
        for (let i = 0; i < 50; i++) {
            try {
                ready = (await fetch("http://127.0.0.1:8765/state")).ok;
            } catch {}
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(ready, "Fixture server readiness");
        const post = (path, body) =>
            fetch(`http://127.0.0.1:8765/${path}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        const state = async () => (await fetch("http://127.0.0.1:8765/state")).json();
        await post("session", { sessionId: "old" });
        await post("telemetry", { sessionId: "old", sequence: 99, value: "old" });
        await post("session", { sessionId: "new" });
        await post("telemetry", { sessionId: "new", sequence: 0, value: "fresh" });
        await post("telemetry", { sessionId: "old", sequence: 100, value: "stale" });
        await post("session", { sessionId: "old" });
        assert.equal((await state()).value, "fresh");
        await post("telemetry", { sessionId: "new", sequence: 2, value: "current" });
        await post("telemetry", { sessionId: "new", sequence: 1, value: "reordered" });
        assert.equal((await state()).value, "current");
    } finally {
        child.kill();
        await new Promise(resolve => child.once("exit", resolve));
        rmSync(output, { recursive: true, force: true });
    }
});
