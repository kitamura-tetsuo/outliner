import "./utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { spawn } from "child_process";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

function startServer() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const cwd = path.resolve(__dirname, "../../server");
    const proc = spawn("node", ["-r", "ts-node/register", "src/index.ts"], {
        cwd,
        env: { ...process.env, PORT: "12351", LOG_LEVEL: "silent" },
        stdio: "inherit",
    });
    return proc;
}

test("server metrics endpoint", async ({ request }) => {
    const proc = startServer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const res = await request.get("http://localhost:12351/metrics");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("connections");
    expect(body).toHaveProperty("totalMessages");
    proc.kill();
});
