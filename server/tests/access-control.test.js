process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"; // Dummy port

const { expect } = require("chai");
const sinon = require("sinon");
const admin = require("firebase-admin");
require("ts-node/register");
const { checkContainerAccess } = require("../src/access-control");

describe("access-control", () => {
    let mockFirestore;
    let collectionStub;
    let docStub;
    let getStub;
    let originalEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.NODE_ENV = "production";
        process.env.FUNCTIONS_EMULATOR = "false";
        process.env.ALLOW_TEST_ACCESS = "false";
        process.env.FIREBASE_PROJECT_ID = "test-project";

        // Mock Firestore
        collectionStub = sinon.stub();
        docStub = sinon.stub();
        getStub = sinon.stub();

        getStub.resolves({ exists: false });
        docStub.returns({ get: getStub });
        collectionStub.returns({ doc: docStub });

        mockFirestore = {
            collection: collectionStub,
        };
    });

    afterEach(() => {
        sinon.restore();
        process.env = originalEnv;
    });

    it("allows access via containerUsers", async () => {
        const containerGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["u1"] }),
        });

        collectionStub.callsFake((name) => {
            if (name === "containerUsers") {
                return {
                    doc: sinon.stub().withArgs("c1").returns({ get: containerGetStub }),
                };
            }
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        expect(result).to.be.true;
    });

    it("allows access via userContainers", async () => {
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleContainerIds: ["c1"] }),
        });

        collectionStub.callsFake((name) => {
            if (name === "userContainers") {
                return {
                    doc: sinon.stub().withArgs("u1").returns({ get: userGetStub }),
                };
            }
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        expect(result).to.be.true;
    });

    it("denies access if neither has permission", async () => {
        const containerGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["other"] }),
        });
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleContainerIds: ["other"] }),
        });

        collectionStub.callsFake((name) => {
            if (name === "containerUsers") return { doc: sinon.stub().returns({ get: containerGetStub }) };
            if (name === "userContainers") return { doc: sinon.stub().returns({ get: userGetStub }) };
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        expect(result).to.be.false;
    });

    it("bypasses check in test environment", async () => {
        process.env.NODE_ENV = "test";

        // Ensure mock is NOT called by making it throw
        const throwingMock = {
            collection: sinon.stub().throws(new Error("Should not be called")),
        };

        const result = await checkContainerAccess("u1", "c1", throwingMock);
        expect(result).to.be.true;
    });

    it("bypasses check if ALLOW_TEST_ACCESS is true", async () => {
        process.env.ALLOW_TEST_ACCESS = "true";

        const throwingMock = {
            collection: sinon.stub().throws(new Error("Should not be called")),
        };

        const result = await checkContainerAccess("u1", "c1", throwingMock);
        expect(result).to.be.true;
    });
});
