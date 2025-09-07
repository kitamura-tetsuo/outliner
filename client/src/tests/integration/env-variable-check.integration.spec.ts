import { describe, expect, it } from "vitest";

describe("environment variables", () => {
    it("does not expose VITE_IS_TEST on global scope", () => {
        expect((globalThis as any).VITE_IS_TEST).toBeUndefined();
    });
});
