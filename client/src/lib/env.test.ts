import { describe, it, expect } from "vitest";
import { getEnv } from "./env";

describe("env", () => {
    it("should return environment variables", () => {
        const env = getEnv("MODE");
        expect(env).toBeDefined();
        // Vitest environment has MODE
    });

    it("should handle missing properties gracefully", () => {
        const env = getEnv("NON_EXISTENT", "default");
        expect(env).toBe("default");
    });
});
