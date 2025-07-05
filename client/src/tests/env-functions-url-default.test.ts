import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserManager } from "../auth/UserManager";

// getEnv関数をモックして、環境変数が設定されていない状態をシミュレート
vi.mock("../lib/env", () => ({
    getEnv: vi.fn((key: string, defaultValue: string = "") => {
        if (key === "VITE_FIREBASE_FUNCTIONS_URL") {
            return defaultValue; // デフォルト値を返す
        }
        // その他の環境変数は通常通り処理
        return import.meta.env[key] || defaultValue;
    }),
}));

describe("API-0005: Functions URL defaults to hosting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses http://localhost:57000 when env var not set", () => {
        const manager = new UserManager();
        // @ts-ignore accessing private field for test
        expect((manager as any).apiBaseUrl).toBe("http://localhost:57000");
    });
});
