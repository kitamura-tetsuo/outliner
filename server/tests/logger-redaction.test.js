require("ts-node/register");
const { Writable } = require("stream");
const { expect } = require("chai");
const { createLogger } = require("../src/logger");

describe("logger redaction", () => {
    it("redacts tokens and emails", done => {
        let output = "";
        const stream = new Writable({
            write(chunk, _enc, cb) {
                output += chunk.toString();
                cb();
            },
        });
        const logger = createLogger(stream);
        logger.info({ token: "secret", email: "user@example.com" }, "test");
        stream.end(() => {
            const log = JSON.parse(output);
            expect(log.token).to.equal("[REDACTED]");
            expect(log.email).to.equal("[REDACTED]");
            done();
        });
    });
});
