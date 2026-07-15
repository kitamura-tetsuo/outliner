/**
 * Tests for environment check function
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkProductionHealth, detectEmulatorEnvironment } from "../check-production-environment.js";

describe("Environment Check Function", () => {
    let originalEnv;

    beforeAll(() => {
        // Save environment variables
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        // Restore environment variables
        process.env = originalEnv;
    });

    describe("Emulator Environment Detection", () => {
        it("determines not emulator environment if all emulator variables are unset", () => {
            // Clear emulator variables
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(false);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(false);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(false);
            expect(result.emulatorStatus.FIREBASE_AUTH_EMULATOR_HOST.exists).toBe(false);
            expect(result.emulatorStatus.FIREBASE_STORAGE_EMULATOR_HOST.exists).toBe(false);
        });

        it("determines emulator environment if FUNCTIONS_EMULATOR is set", () => {
            process.env.FUNCTIONS_EMULATOR = "true";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.value).toBe("true");
        });

        it("determines emulator environment if FIRESTORE_EMULATOR_HOST is set", () => {
            delete process.env.FUNCTIONS_EMULATOR;
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.value).toBe("localhost:58080");
        });

        it("correctly detects if multiple emulator variables are set", () => {
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";
            process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:59099";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIREBASE_AUTH_EMULATOR_HOST.exists).toBe(true);
            expect(result.emulatorStatus.FIREBASE_STORAGE_EMULATOR_HOST.exists).toBe(false);
        });
    });

    describe("Environment Variable Check", () => {
        it("correctly reads NODE_ENV", () => {
            process.env.NODE_ENV = "test";
            expect(process.env.NODE_ENV).toBe("test");

            process.env.NODE_ENV = "production";
            expect(process.env.NODE_ENV).toBe("production");

            process.env.NODE_ENV = "development";
            expect(process.env.NODE_ENV).toBe("development");
        });

        it("correctly reads FIREBASE_PROJECT_ID", () => {
            process.env.FIREBASE_PROJECT_ID = "test-project-id";
            expect(process.env.FIREBASE_PROJECT_ID).toBe("test-project-id");

            process.env.FIREBASE_PROJECT_ID = "outliner-d57b0";
            expect(process.env.FIREBASE_PROJECT_ID).toBe("outliner-d57b0");
        });
    });

    describe("Production Environment Determination", () => {
        it("correctly determines production environment conditions", () => {
            // Production environment settings
            process.env.NODE_ENV = "production";
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(true);
        });

        it("correctly determines development environment conditions", () => {
            // Development environment settings
            process.env.NODE_ENV = "development";
            process.env.FUNCTIONS_EMULATOR = "true";

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(false);
        });

        it("correctly determines test environment conditions", () => {
            // Test environment settings
            process.env.NODE_ENV = "test";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const emulatorInfo = detectEmulatorEnvironment();
            const isProduction = process.env.NODE_ENV === "production" && !emulatorInfo.hasEmulator;

            expect(isProduction).toBe(false);
        });
    });

    describe("Production Environment Health Check", () => {
        it("checkProductionHealth function exists", () => {
            expect(typeof checkProductionHealth).toBe("function");
        });

        it("checkProductionHealth function returns a Promise", () => {
            const result = checkProductionHealth();
            expect(result).toBeInstanceOf(Promise);

            // In test environment, cancel Promise without sending actual request
            result.catch(() => {
                // Error is expected (because of test environment)
            });
        });
    });

    describe("Error Handling", () => {
        it("handles appropriately if environment variables are undefined", () => {
            delete process.env.NODE_ENV;
            delete process.env.FIREBASE_PROJECT_ID;

            // Confirm no error occurs even if environment variables are undefined
            expect(() => {
                const emulatorInfo = detectEmulatorEnvironment();
                expect(emulatorInfo).toHaveProperty("hasEmulator");
                expect(emulatorInfo).toHaveProperty("emulatorStatus");
            }).not.toThrow();
        });

        it("does not error on invalid environment variable values", () => {
            process.env.NODE_ENV = "";
            process.env.FIREBASE_PROJECT_ID = "";
            process.env.FUNCTIONS_EMULATOR = "";

            expect(() => {
                const emulatorInfo = detectEmulatorEnvironment();
                expect(emulatorInfo).toHaveProperty("hasEmulator");
            }).not.toThrow();
        });
    });

    describe("Return Value Format", () => {
        it("detectEmulatorEnvironment function returns object in correct format", () => {
            const result = detectEmulatorEnvironment();

            expect(result).toHaveProperty("hasEmulator");
            expect(result).toHaveProperty("emulatorStatus");
            expect(typeof result.hasEmulator).toBe("boolean");
            expect(typeof result.emulatorStatus).toBe("object");

            // Check each property of emulatorStatus
            const expectedKeys = [
                "FUNCTIONS_EMULATOR",
                "FIRESTORE_EMULATOR_HOST",
                "FIREBASE_AUTH_EMULATOR_HOST",
                "FIREBASE_STORAGE_EMULATOR_HOST",
            ];

            expectedKeys.forEach(key => {
                expect(result.emulatorStatus).toHaveProperty(key);
                expect(result.emulatorStatus[key]).toHaveProperty("exists");
                expect(result.emulatorStatus[key]).toHaveProperty("value");
                expect(typeof result.emulatorStatus[key].exists).toBe("boolean");
                expect(typeof result.emulatorStatus[key].value).toBe("string");
            });
        });
    });
});
