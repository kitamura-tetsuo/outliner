// @ts-nocheck
import type { _Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";

export class CursorFormatting {
    private cursor: any; // Cursorクラスのインスタンスを保持

    constructor(cursor: any) {
        this.cursor = cursor;
    }

    /**
     * 選択範囲のテキストを太字に変更する（Scrapbox構文: [[text]]）
     */
    formatBold() {
        this.applyScrapboxFormatting("bold");
    }

    /**
     * 選択範囲のテキストを斜体に変更する（Scrapbox構文: [/ text]）
     */
    formatItalic() {
        this.applyScrapboxFormatting("italic");
    }

    /**
     * 選択範囲のテキストに下線を追加する（HTML タグを使用）
     */
    formatUnderline() {
        this.applyScrapboxFormatting("underline");
    }

    /**
     * 選択範囲のテキストに取り消し線を追加する（Scrapbox構文: [- text]）
     */
    formatStrikethrough() {
        this.applyScrapboxFormatting("strikethrough");
    }

    /**
     * 選択範囲のテキストをコードに変更する（Scrapbox構文: `text`）
     */
    formatCode() {
        this.applyScrapboxFormatting("code");
    }

    /**
     * 選択範囲にScrapbox構文のフォーマットを適用する
     * @param formatType フォーマットの種類（'bold', 'italic', 'strikethrough', 'underline', 'code'）
     */
    private applyScrapboxFormatting(formatType: "bold" | "italic" | "strikethrough" | "underline" | "code") {
        // 選択範囲を取得
        const selection = Object.values(store.selections).find(s => s.userId === this.cursor.userId);

        if (!selection || selection.startOffset === selection.endOffset) {
            // 選択範囲がない場合は何もしない
            return;
        }

        // 複数アイテムにまたがる選択範囲の場合
        if (selection.startItemId !== selection.endItemId) {
            this.applyScrapboxFormattingToMultipleItems(selection, formatType);
            return;
        }

        // 単一アイテム内の選択範囲の場合
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const startOffset = Math.min(selection.startOffset, selection.endOffset);
        const endOffset = Math.max(selection.startOffset, selection.endOffset);
        const selectedText = text.substring(startOffset, endOffset);

        // フォーマット済みのテキストを作成
        let formattedText = "";
        switch (formatType) {
            case "bold":
                formattedText = ScrapboxFormatter.bold(selectedText);
                break;
            case "italic":
                formattedText = ScrapboxFormatter.italic(selectedText);
                break;
            case "strikethrough":
                formattedText = ScrapboxFormatter.strikethrough(selectedText);
                break;
            case "underline":
                formattedText = ScrapboxFormatter.underline(selectedText);
                break;
            case "code":
                formattedText = ScrapboxFormatter.code(selectedText);
                break;
        }

        // テキストを更新
        const newText = text.substring(0, startOffset) + formattedText + text.substring(endOffset);
        target.updateText(newText);

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.cursor.offset = startOffset + formattedText.length;
        this.cursor.applyToStore();

        // 選択範囲をクリア
        this.cursor.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }

    /**
     * 複数アイテムにまたがる選択範囲にScrapbox構文のフォーマットを適用する
     */
    private applyScrapboxFormattingToMultipleItems(
        selection: any,
        formatType: "bold" | "italic" | "strikethrough" | "underline" | "code",
    ) {
        // 開始アイテムと終了アイテムのIDを取得
        const startItemId = selection.startItemId;
        const endItemId = selection.endItemId;
        const startOffset = selection.startOffset;
        const endOffset = selection.endOffset;
        const isReversed = selection.isReversed;

        // 全アイテムのIDを取得
        const allItemElements = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
        const allItemIds = allItemElements.map(el => el.getAttribute("data-item-id")!);

        // 開始アイテムと終了アイテムのインデックスを取得
        const startIdx = allItemIds.indexOf(startItemId);
        const endIdx = allItemIds.indexOf(endItemId);

        if (startIdx === -1 || endIdx === -1) return;

        // 開始インデックスと終了インデックスを正規化
        const firstIdx = Math.min(startIdx, endIdx);
        const lastIdx = Math.max(startIdx, endIdx);

        // 選択範囲内の各アイテムにフォーマットを適用
        for (let i = firstIdx; i <= lastIdx; i++) {
            const itemId = allItemIds[i];
            const item = this.cursor.searchItem(generalStore.currentPage!, itemId);

            if (!item) continue;

            const text = item.text || "";

            // アイテムの位置に応じてフォーマットを適用
            if (i === firstIdx && i === lastIdx) {
                // 単一アイテム内の選択範囲
                const start = isReversed ? endOffset : startOffset;
                const end = isReversed ? startOffset : endOffset;
                const selectedText = text.substring(start, end);

                // フォーマット済みのテキストを作成
                let formattedText = "";
                switch (formatType) {
                    case "bold":
                        formattedText = ScrapboxFormatter.bold(selectedText);
                        break;
                    case "italic":
                        formattedText = ScrapboxFormatter.italic(selectedText);
                        break;
                    case "strikethrough":
                        formattedText = ScrapboxFormatter.strikethrough(selectedText);
                        break;
                    case "underline":
                        formattedText = ScrapboxFormatter.underline(selectedText);
                        break;
                    case "code":
                        formattedText = ScrapboxFormatter.code(selectedText);
                        break;
                }

                const newText = text.substring(0, start) + formattedText + text.substring(end);
                item.updateText(newText);
            } else {
                // 複数アイテムにまたがる選択範囲の場合は、各アイテムを個別に処理
                // 現在は単一アイテム内の選択範囲のみサポート
                // 将来的に複数アイテムにまたがる選択範囲のフォーマットをサポートする場合は、
                // ここに実装を追加する
            }
        }

        // カーソル位置を更新（選択範囲の終了位置に設定）
        this.cursor.itemId = isReversed ? startItemId : endItemId;
        this.cursor.offset = isReversed ? startOffset : endOffset;
        this.cursor.applyToStore();

        // 選択範囲をクリア
        this.cursor.clearSelection();

        // カーソル点滅を開始
        store.startCursorBlink();
    }
}
