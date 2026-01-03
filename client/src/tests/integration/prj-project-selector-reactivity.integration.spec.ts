import { render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSelector from "../../components/ProjectSelector.svelte";
import { firestoreStore } from "../../stores/firestoreStore.svelte";

// ProjectSelector の <select> の option 数が
// firestoreStore.userProject.accessibleProjectIds の増減に連動して
// 直接増減することを検証する（UI レベルの検証）

describe("PRJ: ProjectSelector option count reflects accessibleProjectIds", () => {
    beforeEach(() => {
        // ProjectSelector 内の ensureUserLoggedIn が参照するオブジェクトを最小スタブ
        (globalThis as any).window ||= globalThis as any;
        (globalThis as any).window.__USER_MANAGER__ = {
            addEventListener: vi.fn(() => vi.fn()),
            getCurrentUser: vi.fn(() => ({ id: "test-user" })),
            auth: { currentUser: { uid: "test-user" } },
            loginWithEmailPassword: vi.fn(async () => ({ success: true })),
        };

        // 初期状態: プロジェクト 1 件
        firestoreStore.setUserProject({
            userId: "u",
            accessibleProjectIds: ["p-1"],
            defaultProjectId: "p-1",
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any);
    });

    it("option 数が accessibleProjectIds の増減に合わせて変化する", async () => {
        render(ProjectSelector);

        const select = screen.getByRole("combobox");
        // 初期 1 件
        expect(within(select).getAllByRole("option").length).toBe(1);

        // 2 件に増やす（配列の破壊的変更 -> Proxy 経由で setUserProject + ucVersion 増分）
        (firestoreStore.userProject!.accessibleProjectIds as any).push("p-2");
        // store integrity check
        expect(firestoreStore.userProject?.accessibleProjectIds?.length ?? 0).toBe(2);
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(2);
        });

        // 1 件に戻す（pop -> setUserProject + ucVersion 増分）
        (firestoreStore.userProject!.accessibleProjectIds as any).pop();
        await waitFor(() => {
            expect(within(select).getAllByRole("option").length).toBe(1);
        });
    });
});

// 明示的に初期化（前テストの push/pop 影響を遮断）
firestoreStore.setUserProject({
    userId: "u",
    accessibleProjectIds: ["p-1"],
    defaultProjectId: "p-1",
    createdAt: new Date(),
    updatedAt: new Date(),
} as any);

it("setUserProject による差し替えでも option 数が即時に反映される", async () => {
    render(ProjectSelector);

    const select = screen.getByRole("combobox");
    expect(within(select).getAllByRole("option").length).toBe(1);

    // 差し替えで 2 件
    firestoreStore.setUserProject({
        userId: "u",
        accessibleProjectIds: ["p-1", "p-2"],
        defaultProjectId: "p-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any);
    expect(firestoreStore.userProject?.accessibleProjectIds?.length ?? 0).toBe(2);
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(2);
    });

    // 差し替えで 1 件に戻す
    firestoreStore.setUserProject({
        userId: "u",
        accessibleProjectIds: ["p-1"],
        defaultProjectId: "p-1",
        createdAt: new Date(),
        updatedAt: new Date(),
    } as any);
    await waitFor(() => {
        expect(within(select).getAllByRole("option").length).toBe(1);
    });
});
