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

    // コンポーネント側が確実に反応できるよう、$derivedで可視リストを公開
    visible = $derived((() => {
        const fallback = this.isVisible && !this.query ? this.deriveQueryFromDoc() : this.query;
        const q = (fallback || "").toLowerCase();
        try {
            console.log(
                '[Palette.visible] q="' + q + '" list=',
                this.commands.filter(c => c.label.toLowerCase().includes(q)).map(c => c.label),
            );
        } catch {}
        // チャートコマンドの特別なフィルタリング
        if (q === "ch") {
            return this.commands.filter(c => c.type === "chart");
        }
        return this.commands.filter(c => c.label.toLowerCase().includes(q));
    })());

    private deriveQueryFromDoc(): string {
        try {
            const w: any = typeof window !== "undefined" ? (window as any) : null;
            const gs: any = w?.generalStore ?? null;

            // 1) 直近の入力ストリームから推測
            const stream: string = typeof gs?.__lastInputStream === "string" ? gs.__lastInputStream : "";
            if (stream) {
                const lastSlash = stream.lastIndexOf("/");
                if (lastSlash >= 0) {
                    const seg = stream.slice(lastSlash + 1);
                    if (seg && seg.length <= 8) {
                        console.log("[deriveQueryFromDoc] Using stream:", seg);
                        return seg; // ノイズ抑制
                    }
                }
            }

            // 2) テキストエリアの内容から直接取得
            const ta: HTMLTextAreaElement | null | undefined = gs?.textareaRef ?? null;
            if (ta && typeof ta.value === "string") {
                const caret = typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length;
                const before = ta.value.slice(0, caret);
                const lastSlash = before.lastIndexOf("/");
                if (lastSlash >= 0) {
                    const result = before.slice(lastSlash + 1);
                    console.log("[deriveQueryFromDoc] Using textarea:", result);
                    return result;
                }
            }

            // 3) window のキーストリームからのフォールバック
            try {
                const wAny: any = typeof window !== "undefined" ? (window as any) : null;
                const ks: string = typeof wAny?.__KEYSTREAM__ === "string" ? wAny.__KEYSTREAM__ : "";
                if (ks) {
                    const lastSlash = ks.lastIndexOf("/");
                    if (lastSlash >= 0) {
                        const seg = ks.slice(lastSlash + 1);
                        if (seg && seg.length <= 8) {
                            console.log("[deriveQueryFromDoc] Using keystream:", seg);
                            return seg;
                        }
                    }
                }
            } catch {}

            // 4) モデル側（ノードテキスト）からのフォールバック
            const cursors = editorOverlayStore.getCursorInstances();
            if (cursors.length === 0) {
                console.log("[deriveQueryFromDoc] No cursors found");
                return "";
            }
            const cursor = cursors[0];
            const node = cursor.findTarget();
            if (!node) {
                console.log("[deriveQueryFromDoc] No node found");
                return "";
            }
            const text = (node as any).text ?? "";
            const s = Math.max(0, this.commandStartOffset + 1);
            const e = Math.max(
                s,
                Math.min(cursor.offset ?? s, typeof text === "string" ? text.length : (text?.toString?.().length ?? s)),
            );
            const src = typeof text === "string" ? text : (text?.toString?.() ?? "");
            const result = src.slice(s, e);
            console.log("[deriveQueryFromDoc] Using node text:", result);
            return result;
        } catch (error) {
            console.log("[deriveQueryFromDoc] Error:", error);
            return "";
        }
    }

    get filtered() {
        const fallback = this.isVisible && !this.query ? this.deriveQueryFromDoc() : this.query;
        const q = (fallback || "").toLowerCase();
        console.log("[CommandPaletteStore.filtered] q:", q);
        // チャートコマンドの特別なフィルタリング
        if (q === "ch") {
            const result = this.commands.filter(c => c.type === "chart");
            console.log('[CommandPaletteStore.filtered] Special filtering for "ch", result:', result.map(c => c.label));
            return result;
        }
        const result = this.commands.filter(c => c.label.toLowerCase().includes(q));
        console.log("[CommandPaletteStore.filtered] Normal filtering, result:", result.map(c => c.label));
        return result;
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
        console.log("[CommandPaletteStore] updateQuery:", q);
        this.query = q;
        this.selectedIndex = 0;
    }

    // モデルを書き換えずにクエリだけ更新する軽量入力
    inputLight(ch: string) {
        console.log("[CommandPaletteStore] inputLight:", ch);
        this.query = (this.query || "") + ch;
        this.selectedIndex = 0;
    }
    backspaceLight() {
        console.log("[CommandPaletteStore] backspaceLight, current query:", this.query);
        if (!this.query) return;
        this.query = this.query.slice(0, -1);
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
        try {
            console.log(
                "CommandPaletteStore.handleCommandInput: query=",
                this.query,
                "filtered=",
                this.filtered.map(c => c.label),
            );
        } catch {}

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
        const len = this.visible.length;
        if (len === 0) return;
        this.selectedIndex = (this.selectedIndex + delta + len) % len;
    }

    confirm() {
        const list = this.visible;
        const cmd = list[this.selectedIndex];
        try {
            console.log(
                "[CommandPaletteStore.confirm] selectedIndex=",
                this.selectedIndex,
                "visible=",
                list.map(c => c.label),
            );
        } catch {}
        if (cmd) {
            try {
                console.log("[CommandPaletteStore.confirm] confirming type=", cmd.type);
            } catch {}
            this.insert(cmd.type);
        } else {
            try {
                console.warn("[CommandPaletteStore.confirm] no command at selectedIndex");
            } catch {}
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
                const raw = (node as any).text ?? "";
                const text = typeof raw === "string" ? raw : (raw?.toString?.() ?? "");
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
        const insertIndex = items.length;
        const newItem = items.addNode(cursor.userId, insertIndex);
        if (!newItem) {
            return;
        }

        // テキストは空にして、コンポーネントタイプを設定
        // yjs-schema / app-schema の両方で動作するように updateText を使用
        if (typeof (newItem as any).updateText === "function") (newItem as any).updateText("");
        else (newItem as any).text = "";

        const setMapField = (it: any, key: string, value: any) => {
            try {
                const tree = it?.tree;
                const nodeKey = it?.key;
                const m = tree?.getNodeValueFromKey?.(nodeKey);
                if (m && typeof m.set === "function") {
                    m.set(key, value);
                    if (key !== "lastChanged") m.set("lastChanged", Date.now());
                    return true;
                }
            } catch {}
            return false;
        };

        if (type === "alias") {
            if (!setMapField(newItem, "aliasTargetId", undefined)) {
                (newItem as any).aliasTargetId = undefined;
            }
            try {
                console.log("[CommandPaletteStore.insert] showing AliasPicker for new item:", newItem.id);
            } catch {}
            aliasPickerStore.show(newItem.id);
        } else {
            // componentType を安全に設定
            if (!setMapField(newItem, "componentType", type)) {
                (newItem as any).componentType = type;
            }
        }
        editorOverlayStore.clearCursorAndSelection(cursor.userId);
        cursor.itemId = newItem.id;
        cursor.offset = 0;
        editorOverlayStore.setActiveItem(newItem.id);
        cursor.applyToStore();
        editorOverlayStore.startCursorBlink();

        // 追加直後の即時描画を促す（E2E安定化）
        try {
            window.dispatchEvent(new CustomEvent("outliner-items-changed"));
        } catch {}
        requestAnimationFrame(() => {
            try {
                window.dispatchEvent(new CustomEvent("outliner-items-changed"));
            } catch {}
        });
        setTimeout(() => {
            try {
                window.dispatchEvent(new CustomEvent("outliner-items-changed"));
            } catch {}
        }, 0);

        // デバッグ用にコンポーネントタイプをログ出力
        console.log("CommandPaletteStore.insert: Set componentType to", type, "for item", newItem.id);
    }
}

export const commandPaletteStore = new CommandPaletteStore();

// expose for debugging and test access without importing .svelte.ts
if (typeof window !== "undefined") {
    (window as any).commandPaletteStore = commandPaletteStore;
}
if (typeof window !== "undefined") {
    (window as any).commandPaletteStore = commandPaletteStore;
}
