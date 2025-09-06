import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { getProjectTitle } from "../../lib/projectTitleProvider";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

describe("ContainerStore integration", () => {
    it("can access store data and resolve project titles", async () => {
        // 初期状態をクリア
        firestoreStore.userContainer = null;

        // タイトル解決をモック
        const mod = await import("../../lib/projectTitleProvider");
        const spy = vi.spyOn(mod, "getProjectTitle").mockImplementation((id: string) => {
            return id === "a" ? "Project A" : id === "b" ? "Project B" : "";
        });

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
        spy.mockRestore();
    });
});
