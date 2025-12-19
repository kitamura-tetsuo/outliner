const { describe, it, beforeEach, afterEach } = require("mocha");
const { expect } = require("chai");
const sinon = require("sinon");

describe("Access Control", function() {
    let checkContainerAccess;
    let mockFirestore;
    let collectionStub;
    let docStub;
    let getStub;
    let originalEnv;

    beforeEach(function() {
        originalEnv = { ...process.env };
        process.env.NODE_ENV = "production";

        // Mock Firestore
        collectionStub = sinon.stub();
        docStub = sinon.stub();
        getStub = sinon.stub();

        mockFirestore = {
            collection: collectionStub,
        };

        // Default setup
        collectionStub.returns({ doc: docStub });
        docStub.returns({ get: getStub });
        getStub.resolves({ exists: false });

        // Load module
        try {
            delete require.cache[require.resolve("../dist/access-control")];
            const module = require("../dist/access-control");
            checkContainerAccess = module.checkContainerAccess;
        } catch (e) {
            console.error("Failed to load ../dist/access-control. Make sure to build the server first.", e);
            throw e;
        }
    });

    afterEach(function() {
        sinon.restore();
        process.env = originalEnv;
    });

    it("allows access if user is in containerUsers", async function() {
        const containerGetStub = sinon.stub();
        containerGetStub.resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["user1", "user2"] }),
        });

        const containerDocStub = sinon.stub();
        containerDocStub.returns({ get: containerGetStub });

        collectionStub.withArgs("containerUsers").returns({ doc: containerDocStub });
        containerDocStub.withArgs("container1").returns({ get: containerGetStub });

        const result = await checkContainerAccess("user1", "container1", mockFirestore);
        expect(result).to.be.true;
    });

    it("denies access if user is NOT in containerUsers AND NOT in userContainers", async function() {
        const containerGetStub = sinon.stub();
        containerGetStub.resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["otherUser"] }),
        });

        const containerDocStub = sinon.stub();
        containerDocStub.returns({ get: containerGetStub });

        collectionStub.withArgs("containerUsers").returns({ doc: containerDocStub });

        const userGetStub = sinon.stub();
        userGetStub.resolves({ exists: false });

        const userDocStub = sinon.stub();
        userDocStub.returns({ get: userGetStub });

        collectionStub.withArgs("userContainers").returns({ doc: userDocStub });

        const result = await checkContainerAccess("user1", "container1", mockFirestore);
        expect(result).to.be.false;
    });

    it("allows access if container is in userContainers", async function() {
        // Fail containerUsers check
        const containerGetStub = sinon.stub();
        containerGetStub.resolves({ exists: false });

        const containerDocStub = sinon.stub();
        containerDocStub.returns({ get: containerGetStub });

        collectionStub.withArgs("containerUsers").returns({ doc: containerDocStub });

        // Pass userContainers check
        const userGetStub = sinon.stub();
        userGetStub.resolves({
            exists: true,
            data: () => ({ accessibleContainerIds: ["container1"] }),
        });

        const userDocStub = sinon.stub();
        userDocStub.returns({ get: userGetStub });

        collectionStub.withArgs("userContainers").returns({ doc: userDocStub });

        const result = await checkContainerAccess("user1", "container1", mockFirestore);
        expect(result).to.be.true;
    });

    it("bypasses check in test environment with flag", async function() {
        process.env.NODE_ENV = "test";
        process.env.ALLOW_TEST_ACCESS = "true";

        const result = await checkContainerAccess("user1", "container1", mockFirestore);
        expect(result).to.be.true;
    });
});
