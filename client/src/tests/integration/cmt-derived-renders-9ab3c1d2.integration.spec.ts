import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import CommentThread from "../../components/CommentThread.svelte";
import { Item } from "../../schema/app-schema";

// jsdom の Clipboard / ResizeObserver など不足 API を最小限スタブ
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserver; }).ResizeObserver = ResizeObserver;

/**
 * CMT-0001 派生状態のみで再描画が成立することを検証する軽量統合テスト
 * - Yjs 側（Item.comments）を更新すると、CommentThread の件数表示が反映される
 * - $effect に依存せず、最小粒度の Yjs observe + $derived 経由で UI が更新される
 */
describe("cmt-derived-renders", () => {
    it("updates renderCommentsState length when Yjs comments change", async () => {
        const item = new Item({ text: "" });

        render(CommentThread, {
            comments: item.comments,
            currentUser: "me",
            doc: item.ydoc,
        });

        // 初期は 0 件
        const counter = await screen.findByText(/\b0\b/, { selector: ".thread-comment-count" });
        expect(counter).toBeTruthy();

        // Yjs 経由でコメントを追加
        item.addComment("me", "hello");

        // コメント件数が 1 に変化するまで待機（派生のみで伝播することを確認）
        await waitFor(async () => {
            const el = await screen.findByText(/\b1\b/, { selector: ".thread-comment-count" });
            expect(el).toBeTruthy();
        });
    });
});
