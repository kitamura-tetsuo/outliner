import { describe, expect, it, vi } from "vitest";
import { resolvePath } from "../../../utils/pathUtils";

vi.mock("$app/paths", () => ({
    resolve: vi.fn((path, _options) => `/resolved${path}`),
}));

describe("pathUtils - resolvePath", () => {
    it("should call kitResolve with the path and undefined as second argument", () => {
        const result = resolvePath("/my-path");
        expect(result).toBe("/resolved/my-path");
    });
});
