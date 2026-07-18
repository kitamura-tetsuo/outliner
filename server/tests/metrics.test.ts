import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import { getMetrics, recordMessage, resetMetrics } from "../src/metrics.js";

function createServer(size = 0) {
    return { getConnectionsCount: () => size };
}

describe("metrics", () => {
    afterEach(() => {
        resetMetrics();
    });

    it("tracks message count", () => {
        recordMessage();
        const metrics = getMetrics(createServer() as any);
        expect(metrics.totalMessages).to.equal(1);
        expect(metrics.msgPerSec).to.be.a("number");
    });
});
