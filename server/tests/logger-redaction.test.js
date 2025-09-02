require("ts-node/register");
const { Writable } = require("stream");
const { expect } = require("chai");
const { createLogger } = require("../src/logger");

describe("logger redaction", () => {
    it("redacts authorization headers, tokens, and emails", done => {
        let output = "";
        const stream = new Writable({
            write(chunk, _enc, cb) {
                output += chunk.toString();
                cb();
            },
        });
        const logger = createLogger(stream);
        logger.info(
            { authorization: "Bearer secret", token: "secret", email: "user@example.com" },
            "test",
        );
        stream.end(() => {
            const log = JSON.parse(output);
            expect(log.authorization).to.equal("[REDACTED]");
            expect(log.token).to.equal("[REDACTED]");
            expect(log.email).to.equal("[REDACTED]");
            done();
        });
    });
});
