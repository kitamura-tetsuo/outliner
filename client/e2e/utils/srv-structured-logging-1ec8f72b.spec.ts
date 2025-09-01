import { expect, test } from "@playwright/test";
import { Writable } from "stream";
test("srv-structured-logging redacts sensitive data", async () => {
    const { createLogger } = await import("../../../server/src/logger.ts");
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
