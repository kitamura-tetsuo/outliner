const request = require('supertest');
const sinon = require('sinon');
const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
let app;
const loggerUtils = require('../utils/logger');

describe('/api/rotate-logs endpoint (LOG-0002)', function () {
  let clientStub, telemetryStub, serverStub;

  beforeEach(function () {
    clientStub = sinon.stub(loggerUtils, 'rotateClientLogs').resolves(true);
    telemetryStub = sinon.stub(loggerUtils, 'rotateTelemetryLogs').resolves(true);
    serverStub = sinon.stub(loggerUtils, 'rotateServerLogs').resolves(true);
    sinon.stub(loggerUtils, 'refreshClientLogStream');
    sinon.stub(loggerUtils, 'refreshTelemetryLogStream');
    sinon.stub(loggerUtils, 'refreshServerLogStream');
    app = require('./log-service-test-helper');
  });

  afterEach(function () {
    sinon.restore();
  });

  it('returns success when rotation completes', async function () {
    const res = await request(app).post('/api/rotate-logs').expect(200);
    expect(res.body.success).to.be.true;
    expect(clientStub.called).to.be.true;
    expect(telemetryStub.called).to.be.true;
    expect(serverStub.called).to.be.true;
  });
});
