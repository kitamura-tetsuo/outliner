import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SnapshotDiffModal from "../../components/SnapshotDiffModal.svelte";

// services をモック（ユニット/統合テストでは限定的なモックを許容）
vi.mock("../../services", () => {
    const now = Date.now();
    const data = [{ id: "s1", timestamp: now - 1000, author: "user1", content: "old" }];
    return {
        listSnapshots: (project: string, page: string) => data,
        getSnapshot: (project: string, page: string, id: string) => data.find(d => d.id === id) ?? null,
        addSnapshot: vi.fn(),
        replaceWithSnapshot: vi.fn((project: string, page: string, id: string) => ({
            id,
            timestamp: now,
            author: "user1",
            content: "old",
        })),
    };
});

describe("HDV: SnapshotDiffModal a11y - li に onclick を持たない", () => {
    beforeEach(() => {
        // JSDOM/Testing Library 上では window の型がランタイムと一致しないことがあるため
        // 以降の (window as any) 利用は Playwright/JSDOM の型不定性に伴う安全な緩和です。
    });

    it("スナップショット選択は button のクリックで動作し、li には onclick が無い", async () => {
        render(SnapshotDiffModal, {
            project: "p",
            page: "pg",
            currentContent: "new",
            author: "user",
        });

        // リスト項目（li）に onclick が設定されていないこと
        const items = await screen.findAllByRole("listitem");
        expect(items.length).toBeGreaterThan(0);
        for (const li of items) {
            expect(li.getAttribute("onclick")).toBeNull();
        }

        // ボタンクリックで diff が表示されること（ins または del が描画される）
        const buttons = await screen.findAllByRole("button");
        const target = buttons.find(b => /user1/.test(b.textContent || "")) || buttons[0];
        await fireEvent.click(target);

        // diff が描画されることを確認
        // NOTE: diff-prettyHtml は <ins>/<del> を用いる
        const diffInserted = document.querySelector(".diff ins, .diff del");
        expect(diffInserted).not.toBeNull();
    });
});
