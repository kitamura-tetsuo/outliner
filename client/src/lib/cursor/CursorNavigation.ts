import type { Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
// import { store as generalStore } from "../../stores/store.svelte"; // Not used

// Define a generic cursor interface that we expect
interface Cursor {
    itemId: string;
    offset: number;
    userId: string;
    cursorId?: string;
    initialColumn: number | null;
    resetInitialColumn(): void;
    findTarget(): Item | null;
    findPreviousItem(): Item | null;
    findNextItem(): Item | null;
    clearSelection(): void;
    applyToStore(): void;
    getVisualLineInfo(
        itemId: string,
        offset: number,
    ): { lineIndex: number; lineStartOffset: number; totalLines: number; } | null;
    getCurrentLineIndex(text: string, offset: number): number;
    getLineStartOffset(text: string, lineIndex: number): number;
    getVisualLineOffsetRange(itemId: string, lineIndex: number): { startOffset: number; endOffset: number; } | null;
    getLineEndOffset(text: string, lineIndex: number): number;
    getCurrentColumn(text: string, offset: number): number;
    // Add other required methods as needed
}

export class CursorNavigation {
    private cursor: Cursor; // Cursorクラスのインスタンスを保持

    constructor(cursor: Cursor) {
        this.cursor = cursor;
    }

    /**
     * カーソルを左に移動する
     */
    moveLeft() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        if (!target) return;

        if (this.cursor.offset > 0) {
            this.cursor.offset = Math.max(0, this.cursor.offset - 1);
            this.cursor.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        } else {
            // 行頭で前アイテムへ移動
            this.navigateToItem("left");
        }
    }

    /**
     * カーソルを右に移動する
     */
    moveRight() {
        // 上下キー以外の操作なので初期列位置をリセット
        this.cursor.resetInitialColumn();

        const target = this.cursor.findTarget();
        const text = target?.text ?? "";

        // テキストが空でない場合のみオフセットを増加
        if (text.length > 0 && this.cursor.offset < text.length) {
            this.cursor.offset = this.cursor.offset + 1;
            this.cursor.applyToStore();

            // カーソルが正しく更新されたことを確認
            store.startCursorBlink();
        } else {
            // 行末または空のテキストの場合は次アイテムへ移動
            this.navigateToItem("right");
        }
    }

    /**
     * カーソルを上に移動する
     */
    moveUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveUp called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // 視覚的な行の情報を取得
        const visualLineInfo = this.cursor.getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = target.text || "";
            const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex > 0) {
                const prevLineStart = this.cursor.getLineStartOffset(text, currentLineIndex - 1);
                this.cursor.offset = prevLineStart;
                this.cursor.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("up");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // 現在の列位置を計算（視覚的な行内での位置）
        const currentColumn = this.cursor.offset - lineStartOffset;

        // 初期列位置を設定または更新
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // 使用する列位置（初期列位置）
        const targetColumn = this.cursor.initialColumn;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex > 0) {
            // 同じアイテム内の上の視覚的な行に移動
            const prevLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex - 1);
            if (prevLineRange) {
                const prevLineLength = prevLineRange.endOffset - prevLineRange.startOffset;
                // 初期列位置か行の長さの短い方に移動
                this.cursor.offset = prevLineRange.startOffset + Math.min(targetColumn, prevLineLength);
                this.cursor.applyToStore();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to previous visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // カーソル点滅を開始
                store.startCursorBlink();
            }
        } else {
            // 前のアイテムを探す
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                // 前のアイテムの最後の視覚的な行に移動
                this.navigateToItem("up");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to previous item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
                if (this.cursor.offset > 0) {
                    this.cursor.offset = 0;
                    this.cursor.applyToStore();

                    // カーソルが正しく更新されたことを確認
                    store.startCursorBlink();

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`Moved to start of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    /**
     * カーソルを下に移動する
     */
    moveDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`moveDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // 視覚的な行の情報を取得
        const visualLineInfo = this.cursor.getVisualLineInfo(this.cursor.itemId, this.cursor.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`getVisualLineInfo result:`, visualLineInfo);
        }

        if (!visualLineInfo) {
            // フォールバック: 論理的な行での処理（改行文字ベース）
            const text = target.text || "";
            const lines = text.split("\n");
            const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
            if (currentLineIndex < lines.length - 1) {
                const nextLineStart = this.cursor.getLineStartOffset(text, currentLineIndex + 1);
                this.cursor.offset = nextLineStart;
                this.cursor.applyToStore();
                store.startCursorBlink();
            } else {
                this.navigateToItem("down");
            }
            return;
        }

        const { lineIndex, lineStartOffset, totalLines } = visualLineInfo;

        // 現在の列位置を計算（視覚的な行内での位置）
        const currentColumn = this.cursor.offset - lineStartOffset;

        // 初期列位置を設定または更新
        if (this.cursor.initialColumn === null) {
            this.cursor.initialColumn = currentColumn;
        }

        // 使用する列位置（初期列位置）
        const targetColumn = this.cursor.initialColumn;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `Visual line info: lineIndex=${lineIndex}, totalLines=${totalLines}, currentColumn=${currentColumn}, targetColumn=${targetColumn}`,
            );
        }

        if (lineIndex < totalLines - 1) {
            // 同じアイテム内の下の視覚的な行に移動
            const nextLineRange = this.cursor.getVisualLineOffsetRange(this.cursor.itemId, lineIndex + 1);
            if (nextLineRange) {
                const nextLineLength = nextLineRange.endOffset - nextLineRange.startOffset;
                // 初期列位置か行の長さの短い方に移動
                this.cursor.offset = nextLineRange.startOffset + Math.min(targetColumn, nextLineLength);
                this.cursor.applyToStore();

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moved to next visual line in same item: offset=${this.cursor.offset}, targetColumn=${targetColumn}`,
                    );
                }

                // カーソル点滅を開始
                store.startCursorBlink();
            }
        } else {
            // 次のアイテムを探す
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                // 次のアイテムの最初の視覚的な行に移動
                this.navigateToItem("down");

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moved to next item: itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const text = target.text || "";
                if (this.cursor.offset < text.length) {
                    this.cursor.offset = text.length;
                    this.cursor.applyToStore();

                    // カーソルが正しく更新されたことを確認
                    store.startCursorBlink();

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`Moved to end of current item: offset=${this.cursor.offset}`);
                    }
                }
            }
        }
    }

    /**
     * アイテム間を移動する
     * @param direction 移動方向
     */
    navigateToItem(direction: "left" | "right" | "up" | "down") {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(
                `navigateToItem called with direction=${direction}, itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // 前後アイテムへの移動はストア更新のみ行い、イベント発行はコンポーネントで処理
        const oldItemId = this.cursor.itemId;
        let newItemId = this.cursor.itemId; // デフォルトは現在のアイテム
        let newOffset = this.cursor.offset; // デフォルトは現在のオフセット
        let itemChanged = false;

        // 現在のアイテムのテキストを取得
        const currentTarget = this.cursor.findTarget();
        const currentText = currentTarget?.text || "";
        const currentColumn = this.cursor.getCurrentColumn(currentText, this.cursor.offset);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
            console.log(`Current column: ${currentColumn}, current text: "${currentText}"`);
        }

        // アイテム間移動の処理
        if (direction === "left") {
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                newOffset = prevItem.text?.length || 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moving left to previous item: id=${prevItem.id}, offset=${newOffset}`);
                }
            } else {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = 0;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "right") {
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                newOffset = 0;
                itemChanged = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`Moving right to next item: id=${nextItem.id}, offset=${newOffset}`);
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = target.text?.length || 0;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        } else if (direction === "up") {
            const prevItem = this.cursor.findPreviousItem();
            if (prevItem) {
                newItemId = prevItem.id;
                const prevText = prevItem.text || "";
                const prevLines = prevText.split("\n");
                const lastLineIndex = prevLines.length - 1;
                const lastLineStart = this.cursor.getLineStartOffset(prevText, lastLineIndex);
                const lastLineEnd = this.cursor.getLineEndOffset(prevText, lastLineIndex);
                const lastLineLength = lastLineEnd - lastLineStart;

                // x座標の変化が最も小さい位置を計算
                // 初期列位置または現在の列位置に最も近い位置を選択
                // 前のアイテムの最後の行の長さを超えないようにする
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    lastLineLength,
                );
                newOffset = lastLineStart + targetColumn;

                // 特殊ケース: 現在のカーソルが行の先頭（オフセット0）にある場合は、
                // 前のアイテムの最後の行の先頭に移動
                if (this.cursor.offset === 0) {
                    newOffset = lastLineStart;
                }

                itemChanged = true;

                // デバッグ情報
                console.log(
                    `navigateToItem up - Moving to previous item's last line: itemId=${prevItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}`,
                );
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moving up to previous item's last line: id=${prevItem.id}, lastLineIndex=${lastLineIndex}, lastLineStart=${lastLineStart}, lastLineLength=${lastLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // 前のアイテムがない場合は、同じアイテムの先頭に移動
                newOffset = 0;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(`No previous item, moving to start of current item: offset=${newOffset}`);
                }
            }
        } else if (direction === "down") {
            const nextItem = this.cursor.findNextItem();
            if (nextItem) {
                newItemId = nextItem.id;
                const nextText = nextItem.text || "";
                // const nextLines = nextText.split("\n"); // Not used
                const firstLineIndex = 0;
                const firstLineStart = this.cursor.getLineStartOffset(nextText, firstLineIndex);
                const firstLineEnd = this.cursor.getLineEndOffset(nextText, firstLineIndex);
                const firstLineLength = firstLineEnd - firstLineStart;

                // x座標の変化が最も小さい位置を計算
                // 初期列位置または現在の列位置に最も近い位置を選択
                // 次のアイテムの最初の行の長さを超えないようにする
                const targetColumn = Math.min(
                    this.cursor.initialColumn !== null ? this.cursor.initialColumn : currentColumn,
                    firstLineLength,
                );
                newOffset = firstLineStart + targetColumn;

                // 特殊ケース: 現在のカーソルが行の末尾（オフセットがテキスト長）にある場合は、
                // 次のアイテムの最初の行の末尾に移動
                const currentTarget = this.cursor.findTarget();
                const currentText = currentTarget?.text || "";
                if (this.cursor.offset === currentText.length) {
                    newOffset = firstLineEnd;
                }

                itemChanged = true;

                // デバッグ情報
                console.log(
                    `navigateToItem down - Moving to next item's first line: itemId=${nextItem.id}, offset=${newOffset}, targetColumn=${targetColumn}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}`,
                );
                if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                    console.log(
                        `Moving down to next item's first line: id=${nextItem.id}, firstLineIndex=${firstLineIndex}, firstLineStart=${firstLineStart}, firstLineLength=${firstLineLength}, newOffset=${newOffset}, currentColumn=${currentColumn}`,
                    );
                }
            } else {
                // 次のアイテムがない場合は、同じアイテムの末尾に移動
                const target = this.cursor.findTarget();
                if (target) {
                    newOffset = target.text?.length || 0;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                        console.log(`No next item, moving to end of current item: offset=${newOffset}`);
                    }
                }
            }
        }

        // アイテムが変更された場合のみ処理を実行
        if (itemChanged) {
            // デバッグ情報
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Item changed: oldItemId=${oldItemId}, newItemId=${newItemId}, newOffset=${newOffset}`);
            }

            // 移動前に古いアイテムのカーソルを確実に削除
            store.clearCursorForItem(oldItemId);

            // 同じユーザーの他のカーソルも削除（単一カーソルモードを維持）
            // 注意: 全てのカーソルをクリアするのではなく、同じユーザーのカーソルのみをクリア
            const cursorsToRemove = Object.values(store.cursors)
                .filter(c => c.userId === this.cursor.userId && c.cursorId !== this.cursor.cursorId)
                .map(c => c.cursorId);

            // デバッグ情報
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors: ${cursorsToRemove.join(", ")}`);
            }

            // 選択範囲をクリア
            this.cursor.clearSelection();

            // 移動先アイテムの既存のカーソルも削除（重複防止）
            // 注意: 同じユーザーのカーソルのみを削除
            const cursorsInTargetItem = Object.values(store.cursors)
                .filter(c => c.itemId === newItemId && c.userId === this.cursor.userId)
                .map(c => c.cursorId);

            // デバッグ情報
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Removing cursors in target item: ${cursorsInTargetItem.join(", ")}`);
            }

            // 新しいアイテムとオフセットを設定
            this.cursor.itemId = newItemId;
            this.cursor.offset = newOffset;

            // アクティブアイテムを更新
            store.setActiveItem(this.cursor.itemId);

            // 新しいカーソルを作成
            const cursorId = store.setCursor({
                itemId: this.cursor.itemId,
                offset: this.cursor.offset,
                isActive: true,
                userId: this.cursor.userId,
            });

            // cursorIdを更新
            this.cursor.cursorId = cursorId;

            // カーソル点滅を開始
            store.startCursorBlink();

            // カスタムイベントを発行
            if (typeof document !== "undefined") {
                const event = new CustomEvent("navigate-to-item", {
                    bubbles: true,
                    detail: {
                        direction,
                        fromItemId: oldItemId,
                        toItemId: this.cursor.itemId,
                        cursorScreenX: 0, // カーソルのX座標（アイテム間移動時は0を指定）
                    },
                });
                document.dispatchEvent(event);
            }
        } else {
            // アイテムが変更されなかった場合でも、カーソルの状態を更新
            this.cursor.offset = newOffset;
            this.cursor.applyToStore();
            store.startCursorBlink();

            // デバッグ情報
            if (typeof window !== "undefined" && (window as Window & { DEBUG_MODE?: boolean; }).DEBUG_MODE) {
                console.log(`Item not changed, updated offset: ${newOffset}`);
            }
        }
    }
}
