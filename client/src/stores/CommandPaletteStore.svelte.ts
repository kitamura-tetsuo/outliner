// @ts-nocheck
import { aliasPickerStore } from "./AliasPickerStore.svelte";
import { editorOverlayStore } from "./EditorOverlayStore.svelte";

export type CommandType = "table" | "chart" | "alias";

interface Position {
    top: number;
    left: number;
}

class CommandPaletteStore {
    isVisible = $state(false);
    position = $state<Position>({ top: 0, left: 0 });
    query = $state("");
    selectedIndex = $state(0);

    // CommandPalette専用のカーソル状態
    private commandCursorItemId = $state<string | null>(null);
    private commandCursorOffset = $state<number>(0);
    private commandStartOffset = $state<number>(0); // スラッシュの位置

    readonly commands = [
        { label: "Table", type: "table" as const },
        { label: "Chart", type: "chart" as const },
        { label: "Alias", type: "alias" as const },
    ];

    get filtered() {
        const q = this.query.toLowerCase();
        return this.commands.filter(c => c.label.toLowerCase().includes(q));
    }

    show(pos: Position) {
        console.log("CommandPaletteStore.show: Called with position:", pos);
        this.position = pos;
        this.query = "";
        this.selectedIndex = 0;
        this.isVisible = true;
        console.log("CommandPaletteStore.show: Set isVisible to true");

        // 現在のカーソル位置を記録
        const cursors = editorOverlayStore.getCursorInstances();
        console.log("CommandPaletteStore.show: Found cursors:", cursors.length);
        if (cursors.length > 0) {
            const cursor = cursors[0];
            this.commandCursorItemId = cursor.itemId;
            this.commandCursorOffset = cursor.offset;
            this.commandStartOffset = cursor.offset - 1; // スラッシュの位置
            console.log("CommandPaletteStore.show: Recorded cursor position:", {
                itemId: cursor.itemId,
                offset: cursor.offset,
                startOffset: this.commandStartOffset,
            });
        }
        console.log("CommandPaletteStore.show: Completed");
    }

    hide() {
        this.isVisible = false;
        this.commandCursorItemId = null;
        this.commandCursorOffset = 0;
        this.commandStartOffset = 0;
    }

    updateQuery(q: string) {
        this.query = q;
        this.selectedIndex = 0;
    }

    /**
     * カーソルとしてふるまい、コマンド文字列を蓄積する
     * @param inputData 入力された文字
     */
    handleCommandInput(inputData: string) {
        console.log("CommandPaletteStore.handleCommandInput: Called with:", inputData);
        console.log("CommandPaletteStore.handleCommandInput: isVisible:", this.isVisible);
        console.log("CommandPaletteStore.handleCommandInput: commandCursorItemId:", this.commandCursorItemId);

        if (!this.isVisible || !this.commandCursorItemId) {
            console.log("CommandPaletteStore.handleCommandInput: Early return - not visible or no cursor");
            return;
        }

        const cursors = editorOverlayStore.getCursorInstances();
        console.log("CommandPaletteStore.handleCommandInput: Found cursors:", cursors.length);
        if (cursors.length === 0) {
            console.log("CommandPaletteStore.handleCommandInput: Early return - no cursors");
            return;
        }

        const cursor = cursors[0];
        const node = cursor.findTarget();
        console.log("CommandPaletteStore.handleCommandInput: Found node:", !!node);
        if (!node) {
            console.log("CommandPaletteStore.handleCommandInput: Early return - no node");
            return;
        }

        // 現在のテキストからコマンド部分を抽出
        const text = node.text || "";
        const beforeSlash = text.slice(0, this.commandStartOffset);
        const afterCursor = text.slice(cursor.offset);

        // 新しいコマンド文字列を構築
        const newCommandText = this.query + inputData;
        const newText = beforeSlash + "/" + newCommandText + afterCursor;

        console.log("CommandPaletteStore.handleCommandInput: Text update:", {
            oldText: text,
            newText: newText,
            oldQuery: this.query,
            newQuery: newCommandText,
        });

        // テキストを更新
        node.updateText(newText);

        // カーソル位置を更新
        const newOffset = this.commandStartOffset + 1 + newCommandText.length;
        cursor.offset = newOffset;
        this.commandCursorOffset = newOffset;

        // クエリを更新
        this.query = newCommandText;
        this.selectedIndex = 0;
        console.log("CommandPaletteStore.handleCommandInput: Updated query:", this.query);
        console.log("CommandPaletteStore.handleCommandInput: Filtered commands:", this.filtered);

        // カーソルを適用
        cursor.applyToStore();

        // 位置を更新
        const pos = this.getCursorScreenPosition();
        if (pos) this.updatePosition(pos);

        console.log("CommandPaletteStore.handleCommandInput: Completed");
    }

    /**
     * バックスペースでコマンド文字列を削除
     */
    handleCommandBackspace() {
        if (!this.isVisible || !this.commandCursorItemId) return;

        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return;

        const cursor = cursors[0];
        const node = cursor.findTarget();
        if (!node) return;

        // クエリが空の場合はスラッシュも削除してコマンドパレットを非表示
        if (this.query.length === 0) {
            const text = node.text || "";
            const beforeSlash = text.slice(0, this.commandStartOffset);
            const afterCursor = text.slice(cursor.offset);

            // スラッシュを削除
            const newText = beforeSlash + afterCursor;
            node.updateText(newText);

            // カーソル位置をスラッシュの位置に戻す
            cursor.offset = this.commandStartOffset;
            cursor.applyToStore();

            this.hide();
            return;
        }

        // 現在のテキストからコマンド部分を削除
        const text = node.text || "";
        const beforeSlash = text.slice(0, this.commandStartOffset);
        const afterCursor = text.slice(cursor.offset);

        // 新しいコマンド文字列を構築（最後の文字を削除）
        const newCommandText = this.query.slice(0, -1);
        const newText = beforeSlash + "/" + newCommandText + afterCursor;

        // テキストを更新
        node.updateText(newText);

        // カーソル位置を更新
        const newOffset = this.commandStartOffset + 1 + newCommandText.length;
        cursor.offset = newOffset;
        this.commandCursorOffset = newOffset;

        // クエリを更新
        this.query = newCommandText;
        this.selectedIndex = 0;

        // カーソルを適用
        cursor.applyToStore();

        // 位置を更新
        const pos = this.getCursorScreenPosition();
        if (pos) this.updatePosition(pos);
    }

    move(delta: number) {
        const len = this.filtered.length;
        if (len === 0) return;
        this.selectedIndex = (this.selectedIndex + delta + len) % len;
    }

    confirm() {
        console.log("CommandPaletteStore.confirm: Called");
        console.log("CommandPaletteStore.confirm: isVisible:", this.isVisible);
        console.log("CommandPaletteStore.confirm: selectedIndex:", this.selectedIndex);
        console.log("CommandPaletteStore.confirm: filtered:", this.filtered);
        console.log("CommandPaletteStore.confirm: filtered.length:", this.filtered.length);

        const cmd = this.filtered[this.selectedIndex];
        console.log("CommandPaletteStore.confirm: selected command:", cmd);

        if (cmd) {
            console.log("CommandPaletteStore.confirm: Calling insert with type:", cmd.type);
            this.insert(cmd.type);
        } else {
            console.warn("CommandPaletteStore.confirm: No command found at selectedIndex:", this.selectedIndex);
        }

        console.log("CommandPaletteStore.confirm: Hiding command palette");
        this.hide();
        console.log("CommandPaletteStore.confirm: Completed");
    }

    updatePosition(pos: Position) {
        this.position = pos;
    }

    getCursorScreenPosition(): Position | null {
        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return null;
        const cursor = cursors[0];
        const itemEl = document.querySelector(
            `.outliner-item[data-item-id="${cursor.itemId}"] .item-text`,
        ) as HTMLElement | null;
        if (!itemEl) return null;
        const textNode = Array.from(itemEl.childNodes).find(
            n => n.nodeType === Node.TEXT_NODE,
        ) as Text | undefined;
        const range = document.createRange();
        const offset = Math.min(cursor.offset, textNode?.textContent?.length ?? 0);
        range.setStart(textNode || itemEl, offset);
        range.collapse(true);
        const rect = range.getClientRects()[0] || itemEl.getBoundingClientRect();
        return { top: rect.bottom + 4, left: rect.left };
    }

    insert(type: CommandType) {
        console.log("CommandPaletteStore.insert: Starting insert process for type:", type);

        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) {
            console.warn("CommandPaletteStore.insert: No cursors found");
            return;
        }
        const cursor = cursors[0];
        console.log("CommandPaletteStore.insert: Using cursor:", cursor.userId, cursor.itemId);

        // コマンド文字列全体（スラッシュ含む）を削除
        if (this.commandCursorItemId) {
            const node = cursor.findTarget();
            if (node) {
                const text = node.text || "";
                const beforeSlash = text.slice(0, this.commandStartOffset);
                const afterCursor = text.slice(cursor.offset);

                // スラッシュとコマンド文字列を削除
                const newText = beforeSlash + afterCursor;
                node.updateText(newText);

                // カーソル位置をスラッシュの位置に戻す
                cursor.offset = this.commandStartOffset;
                cursor.applyToStore();
                console.log("CommandPaletteStore.insert: Command text removed, cursor reset");
            }
        }

        // 常にページ内容のアイテムリストに追加する
        const generalStore = (window as any).generalStore;
        console.log("CommandPaletteStore.insert: generalStore exists:", !!generalStore);
        console.log("CommandPaletteStore.insert: currentPage exists:", !!generalStore?.currentPage);
        console.log("CommandPaletteStore.insert: items exists:", !!generalStore?.currentPage?.items);

        if (!generalStore?.currentPage?.items) {
            console.error("CommandPaletteStore.insert: generalStore.currentPage.items not found");
            return;
        }

        const items = generalStore.currentPage.items;
        const newIndex = items.length;
        console.log("CommandPaletteStore.insert: Current items length:", newIndex);
        console.log("CommandPaletteStore.insert: Adding node at index:", newIndex, "with userId:", cursor.userId);

        // addNode()の戻り値を確認
        const addedItem = items.addNode(cursor.userId, newIndex);
        console.log("CommandPaletteStore.insert: addNode returned:", !!addedItem, addedItem?.id);

        // アイテムリストの長さを再確認
        console.log("CommandPaletteStore.insert: Items length after addNode:", items.length);

        // 追加直後のアイテムを配列インデックスで取得
        const newItem = items[newIndex];
        console.log("CommandPaletteStore.insert: newItem from index:", !!newItem, newItem?.id);

        if (!newItem) {
            console.error("CommandPaletteStore.insert: newItem not found at index", newIndex);
            console.log("CommandPaletteStore.insert: Available items:", [...items].map(item => item.id));
            return;
        }

        console.log("CommandPaletteStore.insert: Setting up new item:", newItem.id);

        // テキストは空にして、コンポーネントタイプを設定
        newItem.text = "";
        if (type === "alias") {
            (newItem as any).aliasTargetId = undefined;
            console.log("CommandPaletteStore.insert: Alias item created:", newItem.id);

            // DOM更新を確実にするために、複数のフレームを待機してからエイリアスピッカーを表示
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        console.log("CommandPaletteStore.insert: Showing alias picker for:", newItem.id);
                        aliasPickerStore.show(newItem.id);
                    }, 50);
                });
            });
        } else {
            newItem.componentType = type;
            console.log("CommandPaletteStore.insert: Component type set:", type);
        }

        editorOverlayStore.clearCursorAndSelection(cursor.userId);
        cursor.itemId = newItem.id;
        cursor.offset = 0;
        editorOverlayStore.setActiveItem(newItem.id);
        cursor.applyToStore();
        editorOverlayStore.startCursorBlink();
        console.log("CommandPaletteStore.insert: Cursor updated to new item:", newItem.id);

        // DOM更新を強制的にトリガーするために、複数のフレームを待機
        if (type === "alias") {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        console.log("CommandPaletteStore.insert: Checking DOM element for:", newItem.id);
                        // エイリアスアイテムのDOM要素が確実に存在することを確認
                        const itemElement = document.querySelector(`[data-item-id="${newItem.id}"]`);
                        if (itemElement) {
                            console.log("CommandPaletteStore: Alias item DOM element found:", newItem.id);
                        } else {
                            console.warn("CommandPaletteStore: Alias item DOM element not found:", newItem.id);

                            // 全てのDOM要素を確認
                            const allItems = document.querySelectorAll("[data-item-id]");
                            console.log(
                                "CommandPaletteStore: All DOM items:",
                                Array.from(allItems).map(el => el.getAttribute("data-item-id")),
                            );

                            // アイテムリストの状態を再確認
                            console.log("CommandPaletteStore: Current items in list:", [...items].map(item => item.id));

                            // DOM要素が見つからない場合、再度カーソルを設定
                            cursor.itemId = newItem.id;
                            cursor.offset = 0;
                            editorOverlayStore.setActiveItem(newItem.id);
                            cursor.applyToStore();
                        }
                    }, 200);
                });
            });
        }

        console.log("CommandPaletteStore.insert: Insert process completed for:", newItem.id);
    }
}

export const commandPaletteStore = new CommandPaletteStore();

// expose for debugging
if (typeof window !== "undefined") {
    (window as any).commandPaletteStore = commandPaletteStore;
}
