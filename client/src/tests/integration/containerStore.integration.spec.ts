import { describe, expect, it } from "vitest";
import { YjsProjectManager } from "../../lib/yjsProjectManager.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

// Fluidベースのタイトルレジストリ参照を廃止し、Yjsのプロジェクトメタデータを利用

describe("ContainerStore integration (Yjs)", () => {
    it("can access firestore store data and read project title via Yjs", async () => {
        // 初期状態をクリア
        firestoreStore.userContainer = null as any;

        // Yjsでプロジェクトを準備
        const projectId = `csi-${Date.now()}`;
        const mgr = new YjsProjectManager(projectId);
        await mgr.connect("Project A");

        // firestoreStoreの更新をテスト
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: [projectId],
            defaultContainerId: projectId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        // firestoreStoreが正しく更新されていることを確認
        expect(firestoreStore.userContainer).not.toBeNull();
        expect(firestoreStore.userContainer!.accessibleContainerIds).toEqual([projectId]);
        expect(firestoreStore.userContainer!.defaultContainerId).toBe(projectId);

        // Yjsからタイトルを取得
        const title = mgr.getProjectTitle();
        expect(title).toBe("Project A");

        // 複数コンテナに変更（ダミー）
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: [projectId, `${projectId}-b`],
            defaultContainerId: projectId,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        expect(firestoreStore.userContainer!.accessibleContainerIds).toEqual([projectId, `${projectId}-b`]);
        expect(firestoreStore.userContainer!.defaultContainerId).toBe(projectId);
    });
});
