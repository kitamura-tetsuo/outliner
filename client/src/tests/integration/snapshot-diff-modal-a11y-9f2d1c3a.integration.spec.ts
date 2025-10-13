import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import SnapshotDiffModal from "../../components/SnapshotDiffModal.svelte";
import { addSnapshot, setCurrentContent } from "../../services";

// 最小回帰テスト: フォーカス維持とキーボード操作（Enter）で差分表示が行えること

describe("SnapshotDiffModal A11y: focus & keyboard minimal regression", () => {
    const project = "p1";
    const page = "PageA";

    beforeEach(() => {
        // ローカルストレージをクリア
        if (typeof localStorage !== "undefined") localStorage.clear();
        // スナップショットを2件用意
        addSnapshot(project, page, "old content", "alice");
        addSnapshot(project, page, "new content", "bob");
        // 現在の内容
        setCurrentContent(project, page, "current content");
    });

    it("リスト項目にフォーカス後、Enterで差分が表示される", async () => {
        render(SnapshotDiffModal, {
            project,
            page,
            currentContent: "current content",
            author: "tester",
        });

        // 最初のスナップショットボタンを取得
        const buttons = await screen.findAllByRole("button");
        const first = buttons.find(b => /Add Snapshot|Revert/.test(b.textContent || "") === false) || buttons[0];

        // フォーカスを当てる
        (first as HTMLButtonElement).focus();
        expect(document.activeElement).toBe(first);

        // Enter キーでアクション（click相当）
        await fireEvent.keyDown(first, { key: "Enter", code: "Enter" });

        // 差分領域にHTMLが描画されていること
        const diff = document.querySelector(".diff") as HTMLElement;
        expect(diff).toBeTruthy();
        expect(diff.innerHTML).not.toBe("");
    });
});
