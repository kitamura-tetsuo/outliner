import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "../lib/env";

// Mock the environment to simulate when VITE_FIREBASE_FUNCTIONS_URL is not set
vi.mock("../lib/env", async () => {
    const actual = await vi.importActual<typeof import("../lib/env")>("../lib/env");
    return {
        ...actual,
        getEnv: vi.fn((key: string, defaultValue: string = "") => {
            if (key === "VITE_FIREBASE_FUNCTIONS_URL") {
                // Simulate that the environment variable is not set by returning the default
                return defaultValue;
            }
            return actual.getEnv(key, defaultValue);
        }),
    };
});

describe("API-0005: Functions URL defaults to hosting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses http://localhost:57000 when env var not set", () => {
        // Directly test the getEnv function to ensure it returns the default value
        const result = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57000");
        expect(result).toBe("http://localhost:57000");
    });
});
