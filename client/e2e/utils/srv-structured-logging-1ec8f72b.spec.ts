import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { Writable } from "stream";
import { fileURLToPath } from "url";
test("srv-structured-logging redacts sensitive data", async () => {
    const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../server");
    const distPath = path.join(serverDir, "dist/logger.js");
    if (!existsSync(distPath)) {
        execSync("npm run build", { cwd: serverDir, stdio: "inherit" });
    }
    const loggerModule: any = await import(distPath);
    const { createLogger } = loggerModule.createLogger ? loggerModule : loggerModule.default;
    let output = "";
    const stream = new Writable({
        write(chunk, _enc, cb) {
            output += chunk.toString();
            cb();
        },
    });
    const logger = createLogger(stream);
    logger.info({ authorization: "Bearer secret", email: "user@example.com" }, "redact");
    const log = JSON.parse(output);
    expect(log.authorization).toBe("[REDACTED]");
    expect(log.email).toBe("[REDACTED]");
});
import "./registerAfterEachSnapshot";
