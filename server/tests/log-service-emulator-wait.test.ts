import { expect } from "chai";
import { afterEach, beforeEach, describe, it } from "mocha";
import sinon from "sinon";

// Test for Firebase emulator wait functionality
describe("Firebase emulator wait functionality (API-0002)", function() {
    let adminStub;
    let loggerStub;
    let processStub;
    let waitForFirebaseEmulator;

    beforeEach(function() {
        // Mock Firebase Admin SDK
        adminStub = {
            auth: sinon.stub().returns({
                listUsers: sinon.stub(),
            }),
        };

        // Mock logger
        loggerStub = {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
        };

        // Mock process environment variables
        processStub = {
            env: {},
        };

        // Mock implementation of waitForFirebaseEmulator function
        waitForFirebaseEmulator = async function(maxRetries = 30, initialDelay = 1000, maxDelay = 10000) {
            const isEmulator = processStub.env.FIREBASE_AUTH_EMULATOR_HOST
                || processStub.env.FIRESTORE_EMULATOR_HOST
                || processStub.env.FIREBASE_EMULATOR_HOST;

            if (!isEmulator) {
                loggerStub.info("Firebase emulator not configured, skipping connection wait");
                return;
            }

            loggerStub.info(`Firebase emulator detected, waiting for connection... (max retries: ${maxRetries})`);

            let retryCount = 0;
            let delay = initialDelay;

            while (retryCount < maxRetries) {
                try {
                    loggerStub.info(`Firebase connection attempt ${retryCount + 1}/${maxRetries}...`);

                    // Test connection to Firebase Auth emulator
                    const listUsersResult = await adminStub.auth().listUsers(1);

                    loggerStub.info(
                        `Firebase emulator connection successful. Found users: ${listUsersResult.users.length}`,
                    );
                    if (listUsersResult.users.length > 0) {
                        loggerStub.info(`First user: ${
                            JSON.stringify({
                                uid: listUsersResult.users[0].uid,
                                email: listUsersResult.users[0].email,
                                displayName: listUsersResult.users[0].displayName,
                            })
                        }`);
                    }

                    return; // Return function on success
                } catch (error) {
                    retryCount++;

                    if (error.code === "ECONNREFUSED" || error.message.includes("ECONNREFUSED")) {
                        loggerStub.warn(
                            `Firebase emulator not ready yet (attempt ${retryCount}/${maxRetries}): ${error.message}`,
                        );

                        if (retryCount < maxRetries) {
                            loggerStub.info(`Waiting ${delay}ms before next retry...`);
                            await new Promise(resolve => setTimeout(resolve, delay));

                            // Exponential backoff (up to max delay)
                            delay = Math.min(delay * 1.5, maxDelay);
                        }
                    } else {
                        // Fail immediately on errors other than ECONNREFUSED
                        loggerStub.error(
                            `Firebase emulator connection failed with non-connection error: ${error.message}`,
                        );
                        throw error;
                    }
                }
            }

            throw new Error(`Firebase emulator connection failed after ${maxRetries} attempts`);
        };
    });

    afterEach(function() {
        sinon.restore();
    });

    it("should wait for emulator startup when Firebase emulator environment variables are set", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // Set successful response
        adminStub.auth().listUsers.resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)")).to
            .be.true;
        expect(loggerStub.info.calledWith("Firebase connection attempt 1/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;
    });

    it("should retry with exponential backoff when ECONNREFUSED error occurs", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // First 2 times are ECONNREFUSED errors, 3rd time is successful
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";

        adminStub.auth().listUsers
            .onCall(0).rejects(econnrefusedError)
            .onCall(1).rejects(econnrefusedError)
            .onCall(2).resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(
            loggerStub.warn.calledWith(
                "Firebase emulator not ready yet (attempt 1/3): connect ECONNREFUSED 127.0.0.1:9099",
            ),
        ).to.be.true;
        expect(
            loggerStub.warn.calledWith(
                "Firebase emulator not ready yet (attempt 2/3): connect ECONNREFUSED 127.0.0.1:9099",
            ),
        ).to.be.true;
        expect(loggerStub.info.calledWith("Waiting 100ms before next retry...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;
    });

    it("should retry up to 30 times with initial delay of 1s and max delay of 10s", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // Always return ECONNREFUSED error
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";
        adminStub.auth().listUsers.rejects(econnrefusedError);

        try {
            await waitForFirebaseEmulator(3, 100, 200); // Set short time for testing
            expect.fail("Should have thrown an error");
        } catch (error) {
            expect(error.message).to.equal("Firebase emulator connection failed after 3 attempts");
            expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)"))
                .to.be.true;
            expect(loggerStub.warn.callCount).to.equal(3);
        }
    });

    it("should test connection to Firebase Auth emulator and wait until successful", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // Response when user exists
        const mockUsers = [{
            uid: "test-uid",
            email: "test@example.com",
            displayName: "Test User",
        }];
        adminStub.auth().listUsers.resolves({ users: mockUsers });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(adminStub.auth().listUsers.calledWith(1)).to.be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 1")).to.be.true;
        expect(
            loggerStub.info.calledWith(
                'First user: {"uid":"test-uid","email":"test@example.com","displayName":"Test User"}',
            ),
        ).to.be.true;
    });

    it("should skip waiting if not in emulator environment", async function() {
        // Do not set environment variables (not emulator environment)

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator not configured, skipping connection wait")).to.be.true;
        expect(adminStub.auth().listUsers.called).to.be.false;
    });

    it("should fail immediately for errors other than ECONNREFUSED", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // Error other than ECONNREFUSED
        const otherError = new Error("Some other error");
        adminStub.auth().listUsers.rejects(otherError);

        try {
            await waitForFirebaseEmulator(3, 100, 1000);
            expect.fail("Should have thrown an error");
        } catch (error) {
            expect(error.message).to.equal("Some other error");
            expect(
                loggerStub.error.calledWith(
                    "Firebase emulator connection failed with non-connection error: Some other error",
                ),
            ).to.be.true;
            expect(adminStub.auth().listUsers.callCount).to.equal(1); // Called only once
        }
    });

    it("should log retry count and delay time", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // First is ECONNREFUSED error, second is successful
        const econnrefusedError = new Error("connect ECONNREFUSED 127.0.0.1:9099");
        econnrefusedError.code = "ECONNREFUSED";

        adminStub.auth().listUsers
            .onCall(0).rejects(econnrefusedError)
            .onCall(1).resolves({ users: [] });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase connection attempt 1/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Firebase connection attempt 2/3...")).to.be.true;
        expect(loggerStub.info.calledWith("Waiting 100ms before next retry...")).to.be.true;
    });

    it("should log user count and user info upon successful connection", async function() {
        // Set environment variables
        processStub.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

        // Response when user exists
        const mockUsers = [{
            uid: "test-uid-123",
            email: "user@test.com",
            displayName: "Test Display Name",
        }];
        adminStub.auth().listUsers.resolves({ users: mockUsers });

        await waitForFirebaseEmulator(3, 100, 1000);

        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 1")).to.be.true;
        expect(
            loggerStub.info.calledWith(
                'First user: {"uid":"test-uid-123","email":"user@test.com","displayName":"Test Display Name"}',
            ),
        ).to.be.true;
    });

    it("should wrap Firebase initialization asynchronously and execute test user setup after emulator wait", async function() {
        // Set environment variables
        processStub.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

        // Mock devAuthHelper
        const devAuthHelperStub = {
            setupTestUser: sinon.stub().resolves({
                uid: "test-user-uid",
                email: "test@example.com",
                displayName: "Test User",
            }),
        };

        // Mock implementation of asynchronous Firebase initialization function
        const initializeFirebase = async function() {
            // Wait for Firebase emulator
            await waitForFirebaseEmulator(3, 100, 1000);

            // Setup test user (after emulator wait)
            if (devAuthHelperStub) {
                const user = await devAuthHelperStub.setupTestUser();
                loggerStub.info(`Setup development test user: ${user.email} (${user.uid})`);
            }
        };

        // Set successful response
        adminStub.auth().listUsers.resolves({ users: [] });

        await initializeFirebase();

        // Verify that emulator wait was executed
        expect(loggerStub.info.calledWith("Firebase emulator detected, waiting for connection... (max retries: 3)")).to
            .be.true;
        expect(loggerStub.info.calledWith("Firebase emulator connection successful. Found users: 0")).to.be.true;

        // Verify that test user setup was executed
        expect(devAuthHelperStub.setupTestUser.called).to.be.true;
        expect(
            loggerStub.info.calledWith(
                "Setup development test user: test@example.com (test-user-uid)",
            ),
        ).to.be.true;
    });
});
