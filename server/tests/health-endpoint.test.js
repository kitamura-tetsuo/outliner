const { expect } = require("chai");
require("ts-node/register");
const http = require("http");
const { loadConfig } = require("../src/config");
const { startServer } = require("../src/server");

function waitListening(server) {
    return new Promise(resolve => server.on("listening", resolve));
}

function get(port) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}/`, res => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => resolve({ status: res.statusCode, text: data }));
        }).on("error", reject);
    });
}

describe("health endpoint", () => {
    it("returns ok", async () => {
        const cfg = loadConfig({ PORT: "12347", LOG_LEVEL: "silent" });
        const { server } = startServer(cfg);
        await waitListening(server);
        const { status, text } = await get(cfg.PORT);
        expect(status).to.equal(200);
        expect(text).to.equal("ok");
        server.close();
    });
});
