import { describe, expect, it } from "vitest";
import { firestoreStore as fluidServiceStore, getProjectTitle } from "../../lib/fluidService.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

describe("ContainerStore integration", () => {
    it("can access firestore store data and project titles", () => {
        // 初期状態をクリア
        firestoreStore.userContainer = null;
        fluidServiceStore.titleRegistry.clear();

        // テストデータを設定
        fluidServiceStore.titleRegistry.set("a", "Project A");
        fluidServiceStore.titleRegistry.set("b", "Project B");

        // firestoreStoreの更新をテスト
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["a"],
            defaultContainerId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        // firestoreStoreが正しく更新されていることを確認
        expect(firestoreStore.userContainer).not.toBeNull();
        expect(firestoreStore.userContainer!.accessibleContainerIds).toEqual(["a"]);
        expect(firestoreStore.userContainer!.defaultContainerId).toBe("a");

        // getProjectTitleが正しく動作することを確認
        expect(getProjectTitle("a")).toBe("Project A");
        expect(getProjectTitle("b")).toBe("Project B");

        // 2番目のコンテナに変更
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["b"],
            defaultContainerId: "b",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        // 更新が正しく反映されていることを確認
        expect(firestoreStore.userContainer!.accessibleContainerIds).toEqual(["b"]);
        expect(firestoreStore.userContainer!.defaultContainerId).toBe("b");

        // 複数のコンテナをテスト
        firestoreStore.userContainer = {
            userId: "u",
            accessibleContainerIds: ["a", "b"],
            defaultContainerId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any;

        expect(firestoreStore.userContainer!.accessibleContainerIds).toEqual(["a", "b"]);
        expect(firestoreStore.userContainer!.defaultContainerId).toBe("a");
    });
});
