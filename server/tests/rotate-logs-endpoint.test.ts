import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import sinon from "sinon";
import request from "supertest";
// @ts-ignore
import LogManager from "../src/utils/log-manager.js";
let app: any;
// @ts-ignore
import { app as helper } from "./log-service-test-helper.js";

describe("/api/rotate-logs endpoint (LOG-0002)", function() {
    let clientStub: sinon.SinonStub;
    let telemetryStub: sinon.SinonStub;
    let serverStub: sinon.SinonStub;

    beforeEach(function() {
        clientStub = sinon.stub(LogManager, "rotateClientLogs").resolves(true);
        telemetryStub = sinon.stub(LogManager, "rotateTelemetryLogs").resolves(true);
        serverStub = sinon.stub(LogManager, "rotateServerLogs").resolves(true);
        sinon.stub(LogManager, "refreshClientLogStream");
        sinon.stub(LogManager, "refreshTelemetryLogStream");
        sinon.stub(LogManager, "refreshServerLogStream");
        app = helper;
    });

    afterEach(function() {
        sinon.restore();
    });

    it("returns success when rotation completes", async function() {
        const res = await request(app).post("/api/rotate-logs").expect(200);
        expect(res.body.success).to.be.true;
        expect(clientStub.called).to.be.true;
        expect(telemetryStub.called).to.be.true;
        expect(serverStub.called).to.be.true;
    });
});
