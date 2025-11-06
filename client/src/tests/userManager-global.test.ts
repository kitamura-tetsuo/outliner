import { describe, expect, it } from "vitest";
import { userManager } from "../auth/UserManager";
import type { UserManager } from "../auth/UserManager";

declare global {
    // eslint-disable-next-line no-var
    var __USER_MANAGER__: UserManager;
}

describe("UserManager global", () => {
    it("exposes instance on window", () => {
        const wm = globalThis.__USER_MANAGER__;
        expect(wm).toBeDefined();
        expect(wm).toBe(userManager);
    });
});
