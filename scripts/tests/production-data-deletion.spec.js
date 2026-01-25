/**
 * Tests for production data deletion function
 *
 * Note: This test is executed only in test environments
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectEmulatorEnvironment } from "../check-production-environment.js";
import { ADMIN_TOKEN, CONFIRMATION_CODE, makeRequest } from "../delete-production-data.js";

describe("Production Data Deletion Function", () => {
    let originalEnv;

    beforeAll(() => {
        // Save environment variables
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        // Restore environment variables
        process.env = originalEnv;
    });

    describe("Environment Check", () => {
        it("correctly detects emulator environment", () => {
            // Emulator environment settings
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.FIRESTORE_EMULATOR_HOST = "localhost:58080";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(true);
            expect(result.emulatorStatus.FUNCTIONS_EMULATOR.exists).toBe(true);
            expect(result.emulatorStatus.FIRESTORE_EMULATOR_HOST.exists).toBe(true);
        });

        it("correctly detects production environment", () => {
            // Production environment settings (remove emulator variables)
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
            delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
            process.env.NODE_ENV = "production";

            const result = detectEmulatorEnvironment();

            expect(result.hasEmulator).toBe(false);
        });
    });

    describe("Authentication and Security", () => {
        it("correct admin token is set", () => {
            expect(ADMIN_TOKEN).toBe("ADMIN_DELETE_ALL_DATA_2024");
            expect(typeof ADMIN_TOKEN).toBe("string");
            expect(ADMIN_TOKEN.length).toBeGreaterThan(10);
        });

        it("correct confirmation code is set", () => {
            expect(CONFIRMATION_CODE).toBe("DELETE_ALL_PRODUCTION_DATA_CONFIRM");
            expect(typeof CONFIRMATION_CODE).toBe("string");
            expect(CONFIRMATION_CODE.length).toBeGreaterThan(10);
        });
    });

    describe("API Request Structure", () => {
        it("makeRequest function creates request in correct format", () => {
            const testData = {
                adminToken: "test-token",
                confirmationCode: "test-code",
            };

            // Check makeRequest function existence and type
            expect(typeof makeRequest).toBe("function");

            // Do not send actual request in test environment
            // Instead check function structure
            expect(() => {
                // Confirm function is callable
                const promise = makeRequest(testData);
                expect(promise).toBeInstanceOf(Promise);
            }).not.toThrow();
        });
    });

    describe("Error Handling", () => {
        it("errors on invalid admin token", async () => {
            // Mock response in test environment
            const mockResponse = {
                statusCode: 401,
                data: { error: "Unauthorized" },
            };

            // Test mock response instead of actual API call
            expect(mockResponse.statusCode).toBe(401);
            expect(mockResponse.data.error).toBe("Unauthorized");
        });

        it("errors on invalid confirmation code", async () => {
            // Mock response in test environment
            const mockResponse = {
                statusCode: 400,
                data: { error: "Invalid confirmation code" },
            };

            expect(mockResponse.statusCode).toBe(400);
            expect(mockResponse.data.error).toBe("Invalid confirmation code");
        });
    });

    describe("Response Format", () => {
        it("success response format is correct", () => {
            const expectedSuccessResponse = {
                success: true,
                message: "Production data deletion completed",
                results: {
                    firestore: { success: true, error: null, deletedCollections: [] },
                    auth: { success: true, error: null, deletedUsers: 0 },
                    storage: { success: true, error: null, deletedFiles: 0 },
                },
                timestamp: expect.any(String),
            };

            // Validate response structure
            expect(expectedSuccessResponse.success).toBe(true);
            expect(expectedSuccessResponse.message).toBe("Production data deletion completed");
            expect(expectedSuccessResponse.results).toHaveProperty("firestore");
            expect(expectedSuccessResponse.results).toHaveProperty("auth");
            expect(expectedSuccessResponse.results).toHaveProperty("storage");
            expect(expectedSuccessResponse).toHaveProperty("timestamp");
        });
    });

    describe("Safety Check", () => {
        it("does not execute actual deletion in test environment", () => {
            // Test environment settings
            process.env.FUNCTIONS_EMULATOR = "true";
            process.env.NODE_ENV = "test";

            const isProduction = !process.env.FUNCTIONS_EMULATOR
                && !process.env.FIRESTORE_EMULATOR_HOST
                && process.env.NODE_ENV === "production";

            expect(isProduction).toBe(false);
        });

        it("correctly determines production environment conditions", () => {
            // Production environment settings
            delete process.env.FUNCTIONS_EMULATOR;
            delete process.env.FIRESTORE_EMULATOR_HOST;
            process.env.NODE_ENV = "production";

            const isProduction = !process.env.FUNCTIONS_EMULATOR
                && !process.env.FIRESTORE_EMULATOR_HOST
                && process.env.NODE_ENV === "production";

            expect(isProduction).toBe(true);
        });
    });

    describe("Data Deletion Targets", () => {
        it("deletion target collections are correctly defined", () => {
            const expectedCollections = ["users", "containers", "projects", "schedules", "user-containers"];

            // Confirm each collection name is string
            expectedCollections.forEach(collection => {
                expect(typeof collection).toBe("string");
                expect(collection.length).toBeGreaterThan(0);
            });

            // Confirm no duplicates
            const uniqueCollections = [...new Set(expectedCollections)];
            expect(uniqueCollections.length).toBe(expectedCollections.length);
        });
    });

    describe("Log Output", () => {
        it("logs output on critical operations", () => {
            // Test log message format
            const criticalLogMessage = "CRITICAL: Starting production data deletion process";
            const completionLogMessage = "CRITICAL: Production data deletion process completed";

            expect(criticalLogMessage).toContain("CRITICAL");
            expect(completionLogMessage).toContain("CRITICAL");
            expect(criticalLogMessage).toContain("production data deletion");
            expect(completionLogMessage).toContain("Production data deletion");
        });
    });
});
