// @ts-nocheck
import type { Item } from "../../schema/yjs-schema";
import { editorOverlayStore as store } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";

export class CursorSelection {
    private cursor: any; // Cursorクラスのインスタンスを保持

    constructor(cursor: any) {
        this.cursor = cursor;
    }

    /**
     * 選択範囲をクリアする
     */
    clearSelection() {
        // 選択範囲をクリア
        store.clearSelectionForUser(this.cursor.userId);
    }

    /**
     * 選択範囲を左に拡張する
     */
    extendSelectionLeft() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを左に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveLeft();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveLeft();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = true;
                }
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを左に移動
                this.cursor.moveLeft();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = true;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // カーソルを左に移動
            this.cursor.moveLeft();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = true;
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.cursor.userId);
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * 選択範囲を右に拡張する
     */
    extendSelectionRight() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを右に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveRight();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveRight();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = false;
                }
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを右に移動
                this.cursor.moveRight();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    isReversed = false;
                    const temp = startItemId;
                    startItemId = endItemId;
                    endItemId = temp;

                    const tempOffset = startOffset;
                    startOffset = endOffset;
                    endOffset = tempOffset;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // カーソルを右に移動
            this.cursor.moveRight();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = false;
        }

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * 選択範囲を上に拡張する
     */
    extendSelectionUp() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを上に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveUp();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = true;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveUp();

                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    isReversed = false;
                }
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを上に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveUp();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = false;

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveUp();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    isReversed = true;
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // カーソルを上に移動
            this.cursor.moveUp();

            endItemId = this.cursor.itemId;
            endOffset = this.cursor.offset;
            isReversed = true;
        }

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * 選択範囲を下に拡張する
     */
    extendSelectionDown() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`extendSelectionDown called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`);
        }

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを下に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveDown();

                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending forward selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveDown();

                    startItemId = oldItemId;
                    startOffset = oldOffset;
                    endItemId = this.cursor.itemId;
                    endOffset = this.cursor.offset;
                    isReversed = false;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを下に移動
                const oldItemId = this.cursor.itemId;
                const oldOffset = this.cursor.offset;
                this.cursor.moveDown();

                startItemId = this.cursor.itemId;
                startOffset = this.cursor.offset;
                isReversed = true;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Extending reversed selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }

                // 選択範囲が消滅した場合は方向を反転
                if (startItemId === endItemId && startOffset === endOffset) {
                    this.cursor.itemId = oldItemId;
                    this.cursor.offset = oldOffset;
                    this.cursor.moveDown();

                    endItemId = oldItemId;
                    endOffset = oldOffset;
                    startItemId = this.cursor.itemId;
                    startOffset = this.cursor.offset;
                    isReversed = false;

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Selection disappeared, reversed: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                        );
                    }
                }
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // 現在位置を保存
            const oldItemId = this.cursor.itemId;
            const oldOffset = this.cursor.offset;

            // カーソルを下に移動
            this.cursor.moveDown();

            // 移動先が同じアイテム内の場合は、全テキストを選択
            if (this.cursor.itemId === oldItemId) {
                const text = target.text || "";
                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset;
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection within same item: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            } else {
                // 別のアイテムに移動した場合
                endItemId = this.cursor.itemId;
                endOffset = this.cursor.offset; // 次のアイテムの現在位置まで選択（以前は0固定だった）
                isReversed = false;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `New selection across items: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}`,
                    );
                }
            }
        }

        // 選択範囲の方向を適切に設定（テスト用の強制設定を削除）
        // 開始と終了が同じアイテムの場合、オフセットで方向を決定
        if (startItemId === endItemId) {
            isReversed = startOffset > endOffset;
        } // 異なるアイテムの場合、DOM上の順序で方向を決定
        else {
            const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];
            const allItemIds = allItems.map(el => el.getAttribute("data-item-id")!);
            const startIdx = allItemIds.indexOf(startItemId);
            const endIdx = allItemIds.indexOf(endItemId);

            // インデックスが見つからない場合はデフォルトで正方向
            if (startIdx === -1 || endIdx === -1) {
                isReversed = false;
            } else {
                isReversed = startIdx > endIdx;
            }
        }

        // 既存の同ユーザーの選択範囲をクリアしてから新しい範囲を設定
        store.clearSelectionForUser(this.cursor.userId);
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}, isReversed=${isReversed}`);
            console.log(`Current selections:`, store.selections);
        }

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // 選択範囲が表示されていない場合は、再度選択範囲を設定
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // 選択範囲の表示を強制的に更新
                    store.forceUpdate();
                }
            }, 150); // タイムアウトを150msに増やして、DOMの更新を待つ時間を長くする
        }
    }

    /**
     * カーソルを行の先頭に移動する
     */
    moveToLineStart() {
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);

        // 現在の行の開始位置に移動
        this.cursor.offset = this.cursor.getLineStartOffset(text, currentLineIndex);
        this.cursor.applyToStore();

        // カーソルが正しく更新されたことを確認
        store.startCursorBlink();
    }

    /**
     * カーソルを行の末尾に移動する
     */
    moveToLineEnd() {
        const target = this.cursor.findTarget();
        if (!target) return;

        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);

        // 現在の行の終了位置に移動
        this.cursor.offset = this.cursor.getLineEndOffset(text, currentLineIndex);
        this.cursor.applyToStore();

        // カーソルが正しく更新されたことを確認
        store.startCursorBlink();
    }

    /**
     * 選択範囲を行頭まで拡張する
     */
    extendSelectionToLineStart() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `extendSelectionToLineStart called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
        const lineStartOffset = this.cursor.getLineStartOffset(text, currentLineIndex);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Current line index: ${currentLineIndex}, lineStartOffset: ${lineStartOffset}, text: "${text}"`,
            );
        }

        // 現在のカーソル位置が既に行頭にある場合は何もしない
        if (this.cursor.offset === lineStartOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line start, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (existingSelection.isReversed) {
                // 逆方向の選択範囲の場合、開始位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを行頭に移動
                endItemId = this.cursor.itemId;
                endOffset = lineStartOffset;
                isReversed = true;
            } else {
                // 正方向の選択範囲の場合、終了位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを行頭に移動
                startItemId = this.cursor.itemId;
                startOffset = lineStartOffset;
                isReversed = false;
            }
        } else {
            // 新規選択範囲の作成
            // 現在位置から行頭までを選択
            startItemId = this.cursor.itemId;
            endItemId = this.cursor.itemId;

            // 現在位置と行頭の位置関係に基づいて方向を決定
            if (this.cursor.offset > lineStartOffset) {
                // 通常の場合（カーソルが行の途中にある）
                startOffset = this.cursor.offset;
                endOffset = lineStartOffset;
                isReversed = true; // 行頭に向かって選択するので逆方向
            } else {
                // カーソルが行頭にある場合（通常はここに入らない）
                startOffset = lineStartOffset;
                endOffset = this.cursor.offset;
                isReversed = false;
            }
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // 選択範囲を設定
        store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // カーソル位置を行頭に移動
        this.cursor.offset = lineStartOffset;
        this.cursor.applyToStore();

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);
    }

    /**
     * 選択範囲を行末まで拡張する
     */
    extendSelectionToLineEnd() {
        const target = this.cursor.findTarget();
        if (!target) return;

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `extendSelectionToLineEnd called for itemId=${this.cursor.itemId}, offset=${this.cursor.offset}`,
            );
        }

        // 現在の選択範囲を取得
        const existingSelection = Object.values(store.selections).find(s =>
            (s.startItemId === this.cursor.itemId || s.endItemId === this.cursor.itemId)
            && s.userId === this.cursor.userId
        );

        let startItemId, startOffset, endItemId, endOffset, isReversed;
        const text = target.text || "";
        const currentLineIndex = this.cursor.getCurrentLineIndex(text, this.cursor.offset);
        const lineEndOffset = this.cursor.getLineEndOffset(text, currentLineIndex);

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Current line index: ${currentLineIndex}, lineEndOffset: ${lineEndOffset}, text: "${text}"`);
        }

        // 現在のカーソル位置が既に行末にある場合は何もしない
        if (this.cursor.offset === lineEndOffset && !existingSelection) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Already at line end, no selection created`);
            }
            return;
        }

        if (existingSelection) {
            // 既存の選択範囲がある場合は拡張
            if (!existingSelection.isReversed) {
                // 正方向の選択範囲の場合、終了位置を移動
                startItemId = existingSelection.startItemId;
                startOffset = existingSelection.startOffset;

                // カーソルを行末に移動
                endItemId = this.cursor.itemId;
                endOffset = lineEndOffset;
                isReversed = false;
            } else {
                // 逆方向の選択範囲の場合、開始位置を移動
                endItemId = existingSelection.endItemId;
                endOffset = existingSelection.endOffset;

                // カーソルを行末に移動
                startItemId = this.cursor.itemId;
                startOffset = lineEndOffset;
                isReversed = true;
            }
        } else {
            // 新規選択範囲の作成
            startItemId = this.cursor.itemId;
            startOffset = this.cursor.offset;

            // 行末までを選択
            endItemId = this.cursor.itemId;
            endOffset = lineEndOffset;
            isReversed = this.cursor.offset > lineEndOffset;
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `Setting selection: startItemId=${startItemId}, startOffset=${startOffset}, endItemId=${endItemId}, endOffset=${endOffset}, isReversed=${isReversed}`,
            );
        }

        // 選択範囲を設定
        const selectionId = store.setSelection({
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId: this.cursor.userId,
            isReversed,
        });

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selection created with ID: ${selectionId}`);
            console.log(`Current selections:`, store.selections);
        }

        // カーソル位置を行末に移動
        this.cursor.offset = lineEndOffset;
        this.cursor.applyToStore();

        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

                // 選択範囲が表示されていない場合は、再度選択範囲を設定
                if (selectionElements.length === 0) {
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // 選択範囲の表示を強制的に更新
                    store.forceUpdate();
                }
            }, 100); // タイムアウトを100msに増やして、DOMの更新を待つ時間を長くする

            // 追加の確認と更新
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (selectionElements.length === 0) {
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Selection still not visible after 100ms, forcing update again`);
                    }

                    // 選択範囲を再設定
                    store.setSelection({
                        startItemId,
                        startOffset,
                        endItemId,
                        endOffset,
                        userId: this.cursor.userId,
                        isReversed,
                    });

                    // 強制的に更新
                    store.forceUpdate();
                }
            }, 200);
        }
    }
}
