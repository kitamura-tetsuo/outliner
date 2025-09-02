import { expect, test } from "@playwright/test";
import { spawn } from "child_process";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

function startServer() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const cwd = path.resolve(__dirname, "../../server");
    const proc = spawn("node", ["-r", "ts-node/register", "src/index.ts"], {
        cwd,
        env: { ...process.env, PORT: "12349", LOG_LEVEL: "silent" },
        stdio: "inherit",
    });
    return proc;
}

test("server health endpoint", async ({ request }) => {
    const proc = startServer();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const res = await request.get("http://localhost:12349/");
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe("ok");
    proc.kill();
});
