import { describe, expect, it } from "vitest";
import { userManager } from "../auth/UserManager";

describe("UserManager global", () => {
    it("exposes instance on window", () => {
        const wm = (globalThis as { __USER_MANAGER__?: unknown; }).__USER_MANAGER__;
        expect(wm).toBeDefined();
        expect(wm).toBe(userManager);
    });
});
