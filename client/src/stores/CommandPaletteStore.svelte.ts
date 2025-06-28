import { editorOverlayStore } from "./EditorOverlayStore.svelte";
import { aliasPickerStore } from "./AliasPickerStore.svelte";

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
        this.position = pos;
        this.query = "";
        this.selectedIndex = 0;
        this.isVisible = true;

        // 現在のカーソル位置を記録
        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length > 0) {
            const cursor = cursors[0];
            this.commandCursorItemId = cursor.itemId;
            this.commandCursorOffset = cursor.offset;
            this.commandStartOffset = cursor.offset - 1; // スラッシュの位置
        }
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
        if (!this.isVisible || !this.commandCursorItemId) return;

        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return;

        const cursor = cursors[0];
        const node = cursor.findTarget();
        if (!node) return;

        // 現在のテキストからコマンド部分を抽出
        const text = node.text || "";
        const beforeSlash = text.slice(0, this.commandStartOffset);
        const afterCursor = text.slice(cursor.offset);

        // 新しいコマンド文字列を構築
        const newCommandText = this.query + inputData;
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
        const cmd = this.filtered[this.selectedIndex];
        if (cmd) {
            this.insert(cmd.type);
        }
        this.hide();
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
        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return;
        const cursor = cursors[0];

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
            }
        }

        // 常にページ内容のアイテムリストに追加する
        const generalStore = (window as any).generalStore;
        if (!generalStore?.currentPage?.items) {
            return;
        }

        const items = generalStore.currentPage.items;
        const newIndex = items.length;
        items.addNode(cursor.userId, newIndex);

        // 追加直後のアイテムを配列インデックスで取得
        const newItem = items[newIndex];
        if (!newItem) {
            return;
        }

        // テキストは空にして、コンポーネントタイプを設定
        newItem.text = "";
        if (type === "alias") {
            (newItem as any).aliasTargetId = undefined;
            aliasPickerStore.show(newItem.id);
        } else {
            newItem.componentType = type;
        }
        editorOverlayStore.clearCursorAndSelection(cursor.userId);
        cursor.itemId = newItem.id;
        cursor.offset = 0;
        editorOverlayStore.setActiveItem(newItem.id);
        cursor.applyToStore();
        editorOverlayStore.startCursorBlink();
    }
}

export const commandPaletteStore = new CommandPaletteStore();

// expose for debugging
if (typeof window !== "undefined") {
    (window as any).commandPaletteStore = commandPaletteStore;
}
