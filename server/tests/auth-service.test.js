/** @feature API-0001 */
const { describe, it, before } = require("mocha");
const { expect } = require("chai");
const apiPort = process.env.TEST_API_PORT;
if (!apiPort) {
  throw new Error("TEST_API_PORT env var is required");
}
const request = require("supertest")(`http://localhost:${apiPort}`);

describe("Auth service integration", function () {
  this.timeout(10000);

  before(async function () {
    // Ensure test user exists
    await request
      .post("/api/create-test-user")
      .send({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User"
      })
      .expect(200);
  });

  it("should respond to health check", async function () {
    const res = await request.get("/health");
    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("OK");
  });

  it("allows test user login", async function () {
    const res = await request
      .post("/api/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("customToken");
    expect(res.body).to.have.nested.property("user.email", "test@example.com");
  });
});
