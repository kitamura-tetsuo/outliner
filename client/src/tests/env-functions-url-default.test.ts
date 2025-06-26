import { describe, it, expect, beforeEach } from "vitest";
import { UserManager } from "../auth/UserManager";

describe("API-0005: Functions URL defaults to hosting", () => {
    beforeEach(() => {
        // @ts-ignore
        import.meta.env = { VITEST: "true", NODE_ENV: "test" } as any;
    });

    it("uses http://localhost:57000 when env var not set", () => {
        const manager = new UserManager();
        // @ts-ignore accessing private field for test
        expect((manager as any).apiBaseUrl).toBe("http://localhost:57000");
    });
});
