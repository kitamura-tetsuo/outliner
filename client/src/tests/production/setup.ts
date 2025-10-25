import { afterAll, beforeAll } from "vitest";

// Production環境用テストセットアップ
beforeAll(async () => {
    // Production Cloud Backend Serversが起動していることを確認
    try {
        const response = await fetch("http://localhost:57000/api/health");
        if (!response.ok) {
            throw new Error("Firebase Functions not available");
        }
        console.log("✓ Firebase Functions (Production) is running");
    } catch (error) {
        console.error("❌ Firebase Functions (Production) is not running");
        console.error("Please start Production Cloud Backend Servers first");
        throw error;
    }

    // SvelteKit server確認（一時的に無効化）
    try {
        const response = await fetch("http://localhost:7073/");
        if (!response.ok) {
            console.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
        } else {
            console.log("✓ SvelteKit server (Production) is running");
        }
    } catch (_) {
        console.warn("⚠️ SvelteKit server (Production) is not running - skipping proxy tests");
    }
});

afterAll(async () => {
    // Production環境のクリーンアップは不要
    // 本番Firebase Authを使用するため、テストユーザーの削除は手動で行う
    console.log("Production tests completed");
});
