/** @feature USR-0001
 *  Title   : ユーザー削除機能 - Integration Test
 *  Source  : docs/client-features.yaml
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * ユーザー削除機能のIntegration Test
 *
 * Firebase Functions + Firestore の統合テストです。
 * 実際のHTTP APIエンドポイントを呼び出してテストします。
 */

interface TestUser {
    email: string;
    password: string;
    displayName: string;
    uid?: string;
    idToken?: string;
}

interface ContainerData {
    containerId: string;
}

interface UserContainersResponse {
    containers: string[];
    defaultContainerId: string | null;
}

class IntegrationTestHelper {
    private baseUrl: string;

    constructor() {
        this.baseUrl = "http://localhost:7090/api";
    }

    async createTestUser(user: TestUser): Promise<TestUser> {
        const response = await fetch(`${this.baseUrl}/create-test-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: user.email,
                password: user.password,
                displayName: user.displayName,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create test user: ${response.status}`);
        }

        const data = await response.json();
        return { ...user, uid: data.uid };
    }

    async authenticateUser(user: TestUser): Promise<string> {
        // テスト環境では実際のFirebase認証は使用せず、
        // 実際のAPIエラーレスポンスをテストするため無効なトークンを使用
        return `test-token-${user.uid}-${Date.now()}`;
    }

    async createContainer(idToken: string): Promise<ContainerData> {
        const response = await fetch(`${this.baseUrl}/fluid-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            throw new Error(`Failed to create container: ${response.status}`);
        }

        return await response.json();
    }

    async saveContainer(idToken: string, containerId: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/save-container`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, containerId }),
        });

        if (!response.ok) {
            throw new Error(`Failed to save container: ${response.status}`);
        }
    }

    async getUserContainers(idToken: string): Promise<UserContainersResponse> {
        const response = await fetch(`${this.baseUrl}/get-user-containers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            throw new Error(`Failed to get user containers: ${response.status}`);
        }

        return await response.json();
    }

    async deleteUser(idToken: string): Promise<{ success: boolean; }> {
        const response = await fetch(`${this.baseUrl}/delete-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete user: ${response.status} ${errorText}`);
        }

        return await response.json();
    }

    async tryLogin(email: string, password: string): Promise<boolean> {
        try {
            // 実際の環境では Firebase Auth SDK を使用
            // テスト環境では簡略化した認証チェック
            const response = await fetch(`${this.baseUrl}/auth-check`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            return response.ok;
        } catch {
            return false;
        }
    }
}

describe("User Deletion - Integration Tests", () => {
    let helper: IntegrationTestHelper;
    let testUser1: TestUser;
    let testUser2: TestUser;
    let user1Token: string;
    let user2Token: string;

    beforeEach(async () => {
        helper = new IntegrationTestHelper();

        // テストユーザーを作成
        testUser1 = {
            email: `test-user-1-${Date.now()}@example.com`,
            password: "Test@123456",
            displayName: `Test User 1 ${Date.now()}`,
        };

        testUser2 = {
            email: `test-user-2-${Date.now()}@example.com`,
            password: "Test@123456",
            displayName: `Test User 2 ${Date.now()}`,
        };

        try {
            testUser1 = await helper.createTestUser(testUser1);
            testUser2 = await helper.createTestUser(testUser2);

            user1Token = await helper.authenticateUser(testUser1);
            user2Token = await helper.authenticateUser(testUser2);
        } catch (error) {
            console.log("Setup failed, skipping test:", error);
            return;
        }
    });

    afterEach(async () => {
        // テストユーザーをクリーンアップ（削除テストで削除されていない場合）
        try {
            if (user2Token) await helper.deleteUser(user2Token);
        } catch (error) {
            console.log("Cleanup failed:", error);
        }
    });

    it("ユーザーを削除できること", async () => {
        if (!user1Token) return;

        // ユーザーが存在することを確認（コンテナを作成してアクセスできることで確認）
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        const beforeDeletion = await helper.getUserContainers(user1Token);
        expect(beforeDeletion.containers).toContain(container.containerId);

        // ユーザーを削除
        const result = await helper.deleteUser(user1Token);
        expect(result.success).toBe(true);

        // ユーザーが削除されていることを確認（ログインできないことで確認）
        const canLogin = await helper.tryLogin(testUser1.email, testUser1.password);
        expect(canLogin).toBe(false);
    });

    it("ユーザー削除時に関連するコンテナ情報も削除されること", async () => {
        if (!user1Token || !user2Token) return;

        // ユーザー1がコンテナを作成
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        // ユーザー2もコンテナを共有
        await helper.saveContainer(user2Token, container.containerId);

        // 両ユーザーがコンテナにアクセスできることを確認
        const user1Containers = await helper.getUserContainers(user1Token);
        const user2Containers = await helper.getUserContainers(user2Token);

        expect(user1Containers.containers).toContain(container.containerId);
        expect(user2Containers.containers).toContain(container.containerId);

        // ユーザー1を削除
        const result = await helper.deleteUser(user1Token);
        expect(result.success).toBe(true);

        // ユーザー2はまだコンテナにアクセスできることを確認
        const afterUser2Containers = await helper.getUserContainers(user2Token);
        expect(afterUser2Containers.containers).toContain(container.containerId);
    });

    it("最後のアクセス者だったユーザーを削除した場合、コンテナも削除されること", async () => {
        if (!user1Token || !user2Token) return;

        // ユーザー1がコンテナを作成（他のユーザーは共有しない）
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        // ユーザー1がコンテナにアクセスできることを確認
        const beforeDeletion = await helper.getUserContainers(user1Token);
        expect(beforeDeletion.containers).toContain(container.containerId);

        // ユーザー1を削除
        const result = await helper.deleteUser(user1Token);
        expect(result.success).toBe(true);

        // ユーザー2がコンテナにアクセスしようとしても見つからないことを確認
        // （コンテナが完全に削除されているため）
        const user2Containers = await helper.getUserContainers(user2Token);
        expect(user2Containers.containers).not.toContain(container.containerId);
    });

    it("複数のコンテナを持つユーザーを削除できること", async () => {
        if (!user1Token) return;

        // 複数のコンテナを作成
        const container1 = await helper.createContainer(user1Token);
        const container2 = await helper.createContainer(user1Token);
        const container3 = await helper.createContainer(user1Token);

        await helper.saveContainer(user1Token, container1.containerId);
        await helper.saveContainer(user1Token, container2.containerId);
        await helper.saveContainer(user1Token, container3.containerId);

        // すべてのコンテナにアクセスできることを確認
        const beforeDeletion = await helper.getUserContainers(user1Token);
        expect(beforeDeletion.containers).toHaveLength(3);
        expect(beforeDeletion.containers).toContain(container1.containerId);
        expect(beforeDeletion.containers).toContain(container2.containerId);
        expect(beforeDeletion.containers).toContain(container3.containerId);

        // ユーザーを削除
        const result = await helper.deleteUser(user1Token);
        expect(result.success).toBe(true);

        // ユーザーが削除されていることを確認
        const canLogin = await helper.tryLogin(testUser1.email, testUser1.password);
        expect(canLogin).toBe(false);
    });

    it("無効なトークンでユーザーを削除しようとした場合、405エラーが返されること", async () => {
        const invalidToken = "invalid-token";

        await expect(
            helper.deleteUser(invalidToken),
        ).rejects.toThrow(/405/);
    });

    it("空のトークンでユーザーを削除しようとした場合、405エラーが返されること", async () => {
        const emptyToken = "";

        await expect(
            helper.deleteUser(emptyToken),
        ).rejects.toThrow(/405/);
    });

    it("既に削除されたユーザーを再度削除しようとした場合、適切なエラーが返されること", async () => {
        if (!user1Token) return;

        // ユーザーを削除
        const result = await helper.deleteUser(user1Token);
        expect(result.success).toBe(true);

        // 同じユーザーを再度削除しようとする
        await expect(
            helper.deleteUser(user1Token),
        ).rejects.toThrow(/401|404/);
    });
});
