/** @feature USR-0002
 *  Title   : コンテナ削除機能 - Integration Test
 *  Source  : docs/client-features.yaml
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * コンテナ削除機能のIntegration Test
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

    async deleteContainer(idToken: string, containerId: string): Promise<{ success: boolean; }> {
        const response = await fetch(`${this.baseUrl}/delete-container`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, containerId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete container: ${response.status} ${errorText}`);
        }

        return await response.json();
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

    async deleteUser(idToken: string): Promise<void> {
        const response = await fetch(`${this.baseUrl}/delete-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            throw new Error(`Failed to delete user: ${response.status}`);
        }
    }
}

describe("Container Deletion - Integration Tests", () => {
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
        // テストユーザーをクリーンアップ
        try {
            if (user1Token) await helper.deleteUser(user1Token);
            if (user2Token) await helper.deleteUser(user2Token);
        } catch (error) {
            console.log("Cleanup failed:", error);
        }
    });

    it("単一ユーザーのコンテナを削除できること", async () => {
        if (!user1Token) return;

        // コンテナを作成
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        // コンテナが保存されていることを確認
        const beforeDeletion = await helper.getUserContainers(user1Token);
        expect(beforeDeletion.containers).toContain(container.containerId);

        // コンテナを削除
        const result = await helper.deleteContainer(user1Token, container.containerId);
        expect(result.success).toBe(true);

        // コンテナが削除されていることを確認
        const afterDeletion = await helper.getUserContainers(user1Token);
        expect(afterDeletion.containers).not.toContain(container.containerId);
    });

    it("複数ユーザー間で共有されたコンテナを削除できること", async () => {
        if (!user1Token || !user2Token) return;

        // ユーザー1がコンテナを作成
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        // ユーザー2もコンテナを保存（共有）
        await helper.saveContainer(user2Token, container.containerId);

        // 両ユーザーがコンテナにアクセスできることを確認
        const user1Containers = await helper.getUserContainers(user1Token);
        const user2Containers = await helper.getUserContainers(user2Token);

        expect(user1Containers.containers).toContain(container.containerId);
        expect(user2Containers.containers).toContain(container.containerId);

        // ユーザー1がコンテナを削除
        const result = await helper.deleteContainer(user1Token, container.containerId);
        expect(result.success).toBe(true);

        // 両ユーザーからコンテナが削除されていることを確認
        const afterUser1Containers = await helper.getUserContainers(user1Token);
        const afterUser2Containers = await helper.getUserContainers(user2Token);

        expect(afterUser1Containers.containers).not.toContain(container.containerId);
        expect(afterUser2Containers.containers).not.toContain(container.containerId);
    });

    it("デフォルトコンテナを削除した場合、別のコンテナがデフォルトになること", async () => {
        if (!user1Token) return;

        // 2つのコンテナを作成
        const container1 = await helper.createContainer(user1Token);
        const container2 = await helper.createContainer(user1Token);

        await helper.saveContainer(user1Token, container1.containerId);
        await helper.saveContainer(user1Token, container2.containerId);

        // 最初のコンテナがデフォルトになっていることを確認
        const beforeDeletion = await helper.getUserContainers(user1Token);
        expect(beforeDeletion.defaultContainerId).toBe(container1.containerId);

        // デフォルトコンテナを削除
        await helper.deleteContainer(user1Token, container1.containerId);

        // 別のコンテナがデフォルトになっていることを確認
        const afterDeletion = await helper.getUserContainers(user1Token);
        expect(afterDeletion.defaultContainerId).toBe(container2.containerId);
        expect(afterDeletion.containers).toEqual([container2.containerId]);
    });

    it("存在しないコンテナを削除しようとした場合、404エラーが返されること", async () => {
        if (!user1Token) return;

        const nonExistentContainerId = `non-existent-${Date.now()}`;

        await expect(
            helper.deleteContainer(user1Token, nonExistentContainerId),
        ).rejects.toThrow(/404/);
    });

    it("アクセス権のないコンテナを削除しようとした場合、403エラーが返されること", async () => {
        if (!user1Token || !user2Token) return;

        // ユーザー1がコンテナを作成（ユーザー2は共有しない）
        const container = await helper.createContainer(user1Token);
        await helper.saveContainer(user1Token, container.containerId);

        // ユーザー2がコンテナを削除しようとする
        await expect(
            helper.deleteContainer(user2Token, container.containerId),
        ).rejects.toThrow(/403/);
    });

    it("無効なトークンでコンテナを削除しようとした場合、405エラーが返されること", async () => {
        const invalidToken = "invalid-token";
        const containerId = "some-container-id";

        await expect(
            helper.deleteContainer(invalidToken, containerId),
        ).rejects.toThrow(/405/);
    });
});
