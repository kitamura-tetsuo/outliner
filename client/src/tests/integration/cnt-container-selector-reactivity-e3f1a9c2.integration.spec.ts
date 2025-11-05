import { render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContainerSelector from "../../components/ContainerSelector.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

// ContainerSelector の <select> の option 数が
// firestoreStore.userContainer.accessibleContainerIds の増減に連動して
// 直接増減することを検証する（UI レベルの検証）

describe("CNT: ContainerSelector option count reflects accessibleContainerIds", () => {
    beforeEach(() => {
        // ContainerSelector 内の ensureUserLoggedIn が参照するオブジェクトを最小スタブ
        const g = globalThis as unknown as { window?: Window & { __USER_MANAGER__?: unknown; }; };
        g.window ||= globalThis as unknown as Window;
        g.window.__USER_MANAGER__ = {
            addEventListener: vi.fn(() => vi.fn()),
            getCurrentUser: vi.fn(() => ({ id: "test-user" })),
            auth: { currentUser: { uid: "test-user" } },
            loginWithEmailPassword: vi.fn(async () => ({ success: true })),
        };

        // 初期状態: コンテナ 1 件
        firestoreStore.setUserContainer({
            userId: "u",
            accessibleContainerIds: ["c-1"],
            defaultContainerId: "c-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    });

    it("option 数が accessibleContainerIds の増減に合わせて変化する", async () => {
        render(ContainerSelector);

        const select = screen.getByRole("combobox");
        // 初期 1 件
        expect(within(select).getAllByRole("option").length).toBe(1);

        // 2 件に増やす（配列の破壊的変更 -> Proxy 経由で setUserContainer + ucVersion 増分）
        (firestoreStore.userContainer!.accessibleContainerIds as unknown as string[]).push("c-2");
        // store integrity check
        expect(firestoreStore.userContainer?.accessibleContainerIds?.length ?? 0).toBe(2);
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(2);
        });

        // 1 件に戻す（pop -> setUserContainer + ucVersion 増分）
        (firestoreStore.userContainer!.accessibleContainerIds as unknown as string[]).pop();
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(1);
        });
    });
});

// 明示的に初期化（前テストの push/pop 影響を遮断）
firestoreStore.setUserContainer({
    userId: "u",
    accessibleContainerIds: ["c-1"],
    defaultContainerId: "c-1",
    createdAt: new Date(),
    updatedAt: new Date(),
});

it("setUserContainer による差し替えでも option 数が即時に反映される", async () => {
    render(ContainerSelector);

    const select = screen.getByRole("combobox");
    expect(within(select).getAllByRole("option").length).toBe(1);

    // 差し替えで 2 件
    firestoreStore.setUserContainer({
        userId: "u",
        accessibleContainerIds: ["c-1", "c-2"],
        defaultContainerId: "c-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    expect(firestoreStore.userContainer?.accessibleContainerIds?.length ?? 0).toBe(2);
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(2);
    });

    // 差し替えで 1 件に戻す
    firestoreStore.setUserContainer({
        userId: "u",
        accessibleContainerIds: ["c-1"],
        defaultContainerId: "c-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(1);
    });
});
