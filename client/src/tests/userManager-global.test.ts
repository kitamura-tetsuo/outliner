import { describe, it, expect } from "vitest";
import { userManager } from "../auth/UserManager";

describe("UserManager global", () => {
  it("exposes instance on window", () => {
    const wm = (globalThis as any).__USER_MANAGER__;
    expect(wm).toBeDefined();
    expect(wm).toBe(userManager);
  });
});
