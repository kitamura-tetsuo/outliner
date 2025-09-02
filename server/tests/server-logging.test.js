require("ts-node/register");
const http = require("http");
const { Writable } = require("stream");
const { expect } = require("chai");
const { createLogger } = require("../src/logger");

describe("server logging", () => {
    it("logs structured JSON on startup", done => {
        let output = "";
        const stream = new Writable({
            write(chunk, _enc, cb) {
                output += chunk.toString();
                cb();
            },
        });
        const logger = createLogger(stream);
        const server = http.createServer();
        server.listen(0, "::", () => {
            const port = server.address().port;
            logger.info({ port }, "y-websocket server listening");
            server.close(() => {
                const log = JSON.parse(output);
                expect(log.port).to.equal(port);
                expect(log.msg).to.equal("y-websocket server listening");
                done();
            });
        });
    });
});
