import { describe, it, expect, vi } from "vitest";
import { resolvePath } from "./pathUtils";
import * as appPaths from "$app/paths";

// Mock SvelteKit's resolve function
vi.mock("$app/paths", () => ({
    resolve: vi.fn((path) => `/resolved/${path}`),
}));

describe("pathUtils", () => {
    describe("resolvePath", () => {
        it("should call SvelteKit resolve with the correct arguments", () => {
            const result = resolvePath("my-path");
            expect(appPaths.resolve).toHaveBeenCalledWith("my-path", undefined);
            expect(result).toBe("/resolved/my-path");
        });
    });
});
