const { expect } = require("chai");
require("ts-node/register");
const { recordMessage, getMetrics, resetMetrics } = require("../src/metrics");

function createServer(size = 0) {
    return { getConnectionsCount: () => size };
}

describe("metrics", () => {
    afterEach(() => {
        resetMetrics();
    });

    it("tracks message count", () => {
        recordMessage();
        const metrics = getMetrics(createServer());
        expect(metrics.totalMessages).to.equal(1);
        expect(metrics.msgPerSec).to.be.a("number");
    });
});
