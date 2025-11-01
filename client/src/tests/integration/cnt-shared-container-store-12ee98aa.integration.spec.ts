import { render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it } from "vitest";
import { firestoreStore } from "../../stores/firestoreStore.svelte";
import UserContainerDisplay from "../fixtures/UserContainerDisplay.svelte";

// Mirrors e2e/new/cnt-shared-container-store-12ee98aa.spec.ts

describe("CNT shared container store", () => {
    it("reflects user container updates", async () => {
        render(UserContainerDisplay);
        const storeGlobal =
            (globalThis as typeof globalThis & { window?: { __FIRESTORE_STORE__?: typeof firestoreStore; }; })?.window
                ?.__FIRESTORE_STORE__ ?? firestoreStore;
        storeGlobal.setUserContainer({
            userId: "u",
            accessibleContainerIds: ["a"],
            defaultContainerId: "a",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await tick();
        await tick();
        // store 自体は更新されているか（デバッグ用アサーション）
        expect(storeGlobal.userContainer?.defaultContainerId).toBe("a");
        // まずリスト表示を確認（リアクティブ更新の完了を待つ）
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a"]);
        // その後、defaultContainerId の可視化を検証
        expect(screen.getByTestId("default").textContent).toBe("a");

        storeGlobal.setUserContainer({
            userId: "u",
            accessibleContainerIds: ["a", "b"],
            defaultContainerId: "b",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await tick();
        expect(screen.getByTestId("default").textContent).toBe("b");
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["a", "b"]);
    });
});
