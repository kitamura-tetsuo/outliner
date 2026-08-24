process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"; // Dummy port

import { expect } from "chai";
import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import sinon from "sinon";
import { checkContainerAccess, findAccessibleProjectIds } from "../src/access-control.js";

describe("access-control", () => {
    let mockFirestore: any;
    let collectionStub: any;
    let docStub: any;
    let getStub: any;
    let originalEnv: NodeJS.ProcessEnv;

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
            settings: sinon.stub(),
            databaseId: sinon.stub(),
            doc: sinon.stub(),
            collectionGroup: sinon.stub(),
            runTransaction: sinon.stub(),
            batch: sinon.stub(),
            getAll: sinon.stub(),
            listCollections: sinon.stub(),
            bulkWriter: sinon.stub(),
            bundle: sinon.stub(),
            recursiveDelete: sinon.stub(),
            terminate: sinon.stub(),
        } as any;
    });

    afterEach(() => {
        sinon.restore();
        process.env = originalEnv;
    });

    it("allows access via projectUsers", async () => {
        const projectGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["u1"] }),
        });

        collectionStub.callsFake((name: string) => {
            if (name === "projectUsers") {
                return {
                    doc: sinon.stub().withArgs("c1").returns({ get: projectGetStub }),
                };
            }
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        expect(result).to.be.true;
    });

    it("discovers project IDs through projectUsers and containerUsers memberships", async () => {
        const getProjectUsers = sinon.stub().resolves({ docs: [{ id: "project-1" }, { id: "project-2" }] });
        const whereProjectUsers = sinon.stub().withArgs("accessibleUserIds", "array-contains", "u1").returns({
            get: getProjectUsers,
        });

        const getContainerUsers = sinon.stub().resolves({ docs: [{ id: "project-2" }, { id: "project-3" }] });
        const whereContainerUsers = sinon.stub().withArgs("accessibleUserIds", "array-contains", "u1").returns({
            get: getContainerUsers,
        });

        collectionStub.withArgs("projectUsers").returns({ where: whereProjectUsers });
        collectionStub.withArgs("containerUsers").returns({ where: whereContainerUsers });

        expect(await findAccessibleProjectIds("u1", mockFirestore)).to.deep.equal([
            "project-1",
            "project-2",
            "project-3",
        ]);
        expect(whereProjectUsers.calledOnce).to.equal(true);
        expect(whereContainerUsers.calledOnce).to.equal(true);
    });

    it("fails closed when accessible-project discovery cannot be established", async () => {
        collectionStub.withArgs("projectUsers").throws(new Error("Firestore unavailable"));
        expect(await findAccessibleProjectIds("u1", mockFirestore)).to.deep.equal([]);
    });

    it("denies access via userProjects (SECURITY)", async () => {
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleProjectIds: ["c1"] }),
        });

        collectionStub.callsFake((name: string) => {
            if (name === "userProjects") {
                return {
                    doc: sinon.stub().withArgs("u1").returns({ get: userGetStub }),
                };
            }
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        // Changed to false because we no longer trust userProjects (user-writable)
        expect(result).to.be.false;
    });

    it("denies access via userContainers (SECURITY)", async () => {
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleContainerIds: ["c1"] }),
        });

        collectionStub.callsFake((name: string) => {
            if (name === "userContainers") {
                return {
                    doc: sinon.stub().withArgs("u1").returns({ get: userGetStub }),
                };
            }
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        // Changed to false because we no longer trust userContainers (user-writable)
        expect(result).to.be.false;
    });

    it("denies access if neither has permission", async () => {
        const projectGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["other"] }),
        });
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleProjectIds: ["other"] }),
        });

        collectionStub.callsFake((name: string) => {
            if (name === "projectUsers") return { doc: sinon.stub().returns({ get: projectGetStub }) };
            if (name === "userProjects") return { doc: sinon.stub().returns({ get: userGetStub }) };
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        expect(result).to.be.false;
    });

    it("bypasses check if ALLOW_TEST_ACCESS is true", async () => {
        process.env.ALLOW_TEST_ACCESS = "true";

        const throwingMock: any = {
            collection: sinon.stub().throws(new Error("Should not be called")),
            settings: sinon.stub(),
            databaseId: sinon.stub(),
            doc: sinon.stub(),
            collectionGroup: sinon.stub(),
            runTransaction: sinon.stub(),
            batch: sinon.stub(),
            getAll: sinon.stub(),
            listCollections: sinon.stub(),
            bulkWriter: sinon.stub(),
            bundle: sinon.stub(),
            recursiveDelete: sinon.stub(),
            terminate: sinon.stub(),
        };

        const result = await checkContainerAccess("u1", "c1", throwingMock);
        expect(result).to.be.true;
    });

    it("should NOT bypass check in development environment (SECURITY)", async () => {
        process.env.NODE_ENV = "development";
        process.env.ALLOW_TEST_ACCESS = "false";
        process.env.FUNCTIONS_EMULATOR = "false";

        // Mock Firestore to ensure it IS called (proving bypass is OFF)
        // We simulate a denial scenario where neither containerUsers nor userContainers grant access
        const containerGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleUserIds: ["other"] }),
        });
        const userGetStub = sinon.stub().resolves({
            exists: true,
            data: () => ({ accessibleContainerIds: ["other"] }),
        });

        collectionStub.callsFake((name: string) => {
            if (name === "projectUsers") return { doc: sinon.stub().returns({ get: containerGetStub }) };
            // Note: userProjects check is removed now, but we check projectUsers returns denied
            return { doc: docStub };
        });

        const result = await checkContainerAccess("u1", "c1", mockFirestore);
        // DESIRED BEHAVIOR: Returns false (access denied because bypass is OFF)
        expect(result).to.be.false;
    });
});
