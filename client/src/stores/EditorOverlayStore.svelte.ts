import { Cursor } from "../lib/Cursor"; // Cursor クラスを import

// Exported types
export interface CursorPosition {
    // 各カーソルインスタンスを一意に識別するID
    cursorId: string;
    // カーソルが属するアイテムのID
    itemId: string;
    // テキストオフセット
    offset: number;
    // このカーソルがアクティブ（点滅中）かどうか
    isActive: boolean;
    // 任意のユーザー識別（将来対応用）
    userId?: string;
    userName?: string;
    color?: string;
}

// グローバル型定義を拡張
declare global {
    interface Window {
        editorOverlayStore?: EditorOverlayStore;
    }
}

export interface SelectionRange {
    // 選択範囲の開始アイテムID
    startItemId: string;
    // 開始オフセット
    startOffset: number;
    // 選択範囲の終了アイテムID
    endItemId: string;
    // 終了オフセット
    endOffset: number;
    // ユーザー識別用
    userId?: string;
    userName?: string;
    // 選択が逆方向か
    isReversed?: boolean;
    color?: string;
    // 矩形選択（ボックス選択）かどうか
    isBoxSelection?: boolean;
    // 矩形選択の場合の各行の開始・終了オフセット
    boxSelectionRanges?: Array<{
        itemId: string;
        startOffset: number;
        endOffset: number;
    }>;
}

// Svelte 5 ランタイムの runes マクロを利用 (import は不要)

export class EditorOverlayStore {
    cursors = $state<Record<string, CursorPosition>>({});
    // Cursor インスタンスを保持する Map
    cursorInstances = new Map<string, Cursor>();
    selections = $state<Record<string, SelectionRange>>({});
    activeItemId = $state<string | null>(null);
    cursorVisible = $state<boolean>(true);
    animationPaused = $state<boolean>(false);
    // GlobalTextArea の textarea 要素を保持
    textareaRef = $state<HTMLTextAreaElement | null>(null);
    // onEdit コールバック
    onEditCallback: (() => void) | null = null;

    // Command Palette State
    commandPaletteVisible = $state<boolean>(false);
    commandPaletteItemId = $state<string | null>(null);
    commandPaletteOffset = $state<number>(0);
    commandPalettePosition = $state<{ top: number; left: number } | null>(null);

    private timerId!: ReturnType<typeof setTimeout>;

    // テキストエリア参照を設定
    setTextareaRef(el: HTMLTextAreaElement | null) {
        this.textareaRef = el;
    }

    // テキストエリア参照を取得
    getTextareaRef(): HTMLTextAreaElement | null {
        return this.textareaRef;
    }

    // onEdit コールバックを設定
    setOnEditCallback(callback: (() => void) | null) {
        this.onEditCallback = callback;
    }

    // onEdit コールバックを取得
    getOnEditCallback(): (() => void) | null {
        return this.onEditCallback;
    }

    // onEdit コールバックを呼び出す
    triggerOnEdit() {
        if (this.onEditCallback) {
            this.onEditCallback();
        }
    }

    private genUUID(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }
        const bytes = (typeof crypto !== "undefined" ? crypto.getRandomValues(new Uint8Array(16)) : null) ||
            new Uint8Array(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex: string[] = Array.from(bytes).map(b => b.toString(16).padStart(2, "0"));
        return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${
            hex.slice(8, 10).join("")
        }-${hex.slice(10, 16).join("")}`;
    }

    updateCursor(cursor: CursorPosition) {
        // Map のインスタンスと同期
        const inst = this.cursorInstances.get(cursor.cursorId);
        if (inst) {
            // 既存のインスタンスを更新
            inst.itemId = cursor.itemId;
            inst.offset = cursor.offset;
            inst.isActive = cursor.isActive;
            if (cursor.userId) inst.userId = cursor.userId;
        }
        else {
            // インスタンスが存在しない場合は新しく作成
            const newInst = new Cursor(cursor.cursorId, {
                itemId: cursor.itemId,
                offset: cursor.offset,
                isActive: cursor.isActive,
                userId: cursor.userId ?? "local",
            });
            this.cursorInstances.set(cursor.cursorId, newInst);
        }

        // Reactive state を更新
        this.cursors = { ...this.cursors, [cursor.cursorId]: cursor };

        // アクティブアイテムを更新
        if (cursor.isActive) {
            this.setActiveItem(cursor.itemId);
        }
    }

    /**
     * 新しいカーソルを追加する
     * @param omitProps カーソルのプロパティ（cursorId以外）
     * @returns 新しいカーソルのID
     */
    addCursor(omitProps: Omit<CursorPosition, "cursorId">) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`EditorOverlayStore.addCursor called with:`, omitProps);
            console.log(`Current cursors:`, this.cursors);
            console.log(`Current cursor instances:`, Array.from(this.cursorInstances.keys()));
        }

        // 新しいカーソルIDを生成
        const newId = this.genUUID();

        // 同じアイテムの同じ位置に既にカーソルがあるか確認（より厳密なチェック）
        const existingCursor = Object.values(this.cursors).find(c =>
            c.itemId === omitProps.itemId &&
            c.offset === omitProps.offset &&
            c.userId === (omitProps.userId ?? "local")
        );

        if (existingCursor) {
            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Cursor already exists at this position, returning existing ID: ${existingCursor.cursorId}`,
                );
            }

            // 既存のカーソルを確実にアクティブにする
            this.updateCursor({
                ...existingCursor,
                isActive: true,
            });

            // カーソル点滅を開始
            this.startCursorBlink();

            // グローバルテキストエリアにフォーカスを確保
            const textarea = this.getTextareaRef();
            if (textarea) {
                // フォーカスを確実に設定するための複数の試行
                textarea.focus();

                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    textarea.focus();

                    // さらに確実にするためにsetTimeoutも併用
                    setTimeout(() => {
                        textarea.focus();

                        // デバッグ情報
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
                                `Focus set after finding existing cursor. Active element is textarea: ${
                                    document.activeElement === textarea
                                }`,
                            );
                        }
                    }, 10);
                });
            }
            else {
                // テキストエリアが見つからない場合はエラーログ
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Global textarea not found in addCursor (existing cursor)`);
                }
            }

            return existingCursor.cursorId;
        }

        // Cursor インスタンスを生成して保持
        const cursorInst = new Cursor(newId, {
            itemId: omitProps.itemId,
            offset: omitProps.offset,
            isActive: omitProps.isActive,
            userId: omitProps.userId ?? "local",
        });
        this.cursorInstances.set(newId, cursorInst);

        // 新しいカーソルを作成
        const newCursor: CursorPosition = {
            cursorId: newId,
            ...omitProps,
            userId: omitProps.userId ?? "local", // userId が undefined の場合に "local" を設定
        };

        // カーソルを更新（reactive stateを更新）
        this.updateCursor(newCursor);

        // グローバルテキストエリアにフォーカスを確保
        const textarea = this.getTextareaRef();
        if (textarea) {
            // フォーカスを確実に設定するための複数の試行
            textarea.focus();

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textarea.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textarea.focus();

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
                            `Focus set after adding new cursor. Active element is textarea: ${
                                document.activeElement === textarea
                            }`,
                        );
                    }
                }, 10);
            });
        }
        else {
            // テキストエリアが見つからない場合はエラーログ
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Global textarea not found in addCursor (new cursor)`);
            }
        }

        // カーソル点滅を開始
        this.startCursorBlink();

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`New cursor added with ID: ${newId}`);
            console.log(`Updated cursors:`, this.cursors);
            console.log(`Updated cursor instances:`, Array.from(this.cursorInstances.keys()));
        }

        return newId;
    }

    removeCursor(cursorId: string) {
        // Map からインスタンスを削除
        this.cursorInstances.delete(cursorId);
        // Reactive state からも削除
        const newCursors = { ...this.cursors };
        delete newCursors[cursorId];
        this.cursors = newCursors;
    }

    setSelection(selection: SelectionRange) {
        // 選択範囲のキーを開始アイテムIDと終了アイテムIDの組み合わせにする
        const key = `${selection.startItemId}-${selection.endItemId}-${selection.userId || "local"}`;
        this.selections = { ...this.selections, [key]: selection };
    }

    /**
     * 矩形選択（ボックス選択）を設定する
     * @param startItemId 開始アイテムID
     * @param startOffset 開始オフセット
     * @param endItemId 終了アイテムID
     * @param endOffset 終了オフセット
     * @param boxSelectionRanges 各行の選択範囲
     * @param userId ユーザーID（デフォルトは"local"）
     */
    setBoxSelection(
        startItemId: string,
        startOffset: number,
        endItemId: string,
        endOffset: number,
        boxSelectionRanges: Array<{
            itemId: string;
            startOffset: number;
            endOffset: number;
        }>,
        userId = "local",
    ) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`setBoxSelection called with:`, {
                startItemId,
                startOffset,
                endItemId,
                endOffset,
                boxSelectionRanges,
                userId,
            });
        }

        // 引数の検証
        if (!startItemId || !endItemId) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Invalid item IDs: startItemId=${startItemId}, endItemId=${endItemId}`);
            }
            return;
        }

        // 既存の選択範囲をクリア（同じユーザーの矩形選択のみ）
        const existingBoxSelections = Object.entries(this.selections)
            .filter(([_, s]) => s.userId === userId && s.isBoxSelection)
            .map(([key, _]) => key);

        if (existingBoxSelections.length > 0) {
            const newSelections = { ...this.selections };
            existingBoxSelections.forEach(key => {
                delete newSelections[key];
            });
            this.selections = newSelections;
        }

        // 矩形選択を設定
        const selection: SelectionRange = {
            startItemId,
            startOffset,
            endItemId,
            endOffset,
            userId,
            isBoxSelection: true,
            boxSelectionRanges,
        };

        // 選択範囲のキーを開始アイテムIDと終了アイテムIDの組み合わせにする
        const key = `box-${startItemId}-${endItemId}-${userId}`;
        this.selections = { ...this.selections, [key]: selection };

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Box selection set with key: ${key}`);
            console.log(`Current selections:`, this.selections);
        }
    }

    /**
     * すべての選択範囲をクリアする
     */
    clearSelections() {
        this.selections = {};
    }

    /**
     * 指定したユーザーの選択範囲をクリアする
     * @param userId ユーザーID（デフォルトは"local"）
     */
    clearSelectionForUser(userId = "local") {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`clearSelectionForUser called with userId=${userId}`);
            console.log(`Current selections before clearing:`, this.selections);
        }

        // 指定されたユーザーの選択範囲を削除（通常の選択範囲と矩形選択の両方）
        // 選択範囲のキーに含まれるuserIdとメソッドに渡すuserIdが一致するものを削除
        this.selections = Object.fromEntries(
            Object.entries(this.selections).filter(([key, s]) => {
                // キーにuserIdが含まれているか確認
                const keyIncludesUserId = key.includes(`-${userId}`);
                // オブジェクトのuserIdプロパティが一致するか確認
                const objectUserIdMatches = s.userId === userId || (!s.userId && userId === "local");

                // どちらかが一致する場合は削除対象
                return !keyIncludesUserId && !objectUserIdMatches;
            }),
        );

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Selections after clearing:`, this.selections);

            // 選択範囲が正しくクリアされたか確認
            const remainingSelections = Object.entries(this.selections).filter(([key, s]) =>
                key.includes(`-${userId}`) || s.userId === userId || (!s.userId && userId === "local")
            );

            if (remainingSelections.length > 0) {
                console.warn(`Warning: Some selections for userId=${userId} were not cleared:`, remainingSelections);
            }
            else {
                console.log(`All selections for userId=${userId} were successfully cleared`);
            }
        }
    }

    setActiveItem(itemId: string | null) {
        this.activeItemId = itemId;
    }

    getActiveItem(): string | null {
        return this.activeItemId;
    }

    setCursorVisible(visible: boolean) {
        this.cursorVisible = visible;
    }

    setAnimationPaused(paused: boolean) {
        this.animationPaused = paused;
    }

    startCursorBlink() {
        this.cursorVisible = true;
        clearInterval(this.timerId);
        // 単純に toggle するので Node でも動作
        this.timerId = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
        }, 530);
    }

    stopCursorBlink() {
        if (this) {
            clearInterval(this.timerId);
            this.cursorVisible = true;
        }
    }

    /**
     * 指定したユーザーのカーソルをすべて削除する
     * @param userId ユーザーID（デフォルトは"local"）
     * @param clearSelections 選択範囲も削除するかどうか（デフォルトはfalse）
     * @param preserveAltClick Alt+クリックで追加されたカーソルを保持するかどうか（デフォルトはfalse）
     */
    clearCursorAndSelection(userId = "local", clearSelections = false, preserveAltClick = false) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(
                `clearCursorAndSelection called with userId=${userId}, clearSelections=${clearSelections}, preserveAltClick=${preserveAltClick}`,
            );
            console.log(`Current cursors before clearing:`, this.cursors);
        }

        // Alt+クリックで追加されたカーソルを保持する場合
        if (preserveAltClick) {
            // 削除対象のカーソルIDを収集（アクティブなカーソルのみ削除）
            const cursorIdsToRemove: string[] = [];
            const cursorIdsToKeep: string[] = [];

            // Map から一致するインスタンスを特定
            for (const [cursorId, inst] of this.cursorInstances.entries()) {
                if (inst.userId === userId) {
                    if (inst.isActive) {
                        // アクティブなカーソルのみ削除
                        cursorIdsToRemove.push(cursorId);
                    }
                    else {
                        // 非アクティブなカーソルは保持
                        cursorIdsToKeep.push(cursorId);
                    }
                }
            }

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Cursors to remove: ${cursorIdsToRemove.length}, Cursors to keep: ${cursorIdsToKeep.length}`,
                );
            }

            // 特定したカーソルをすべて削除
            if (cursorIdsToRemove.length > 0) {
                // Map からインスタンスを削除
                cursorIdsToRemove.forEach(id => {
                    this.cursorInstances.delete(id);
                });

                // Reactive state を更新（保持するカーソルを除外）
                this.cursors = Object.fromEntries(
                    Object.entries(this.cursors).filter(([id, c]) =>
                        c.userId !== userId || cursorIdsToKeep.includes(id)
                    ),
                );
            }
        }
        else {
            // 通常の削除処理（すべてのカーソルを削除）
            // 削除対象のカーソルIDを収集
            const cursorIdsToRemove: string[] = [];

            // Map から一致するインスタンスを特定
            for (const [cursorId, inst] of this.cursorInstances.entries()) {
                if (inst.userId === userId) {
                    cursorIdsToRemove.push(cursorId);
                }
            }

            // 特定したカーソルをすべて削除
            if (cursorIdsToRemove.length > 0) {
                // Map からインスタンスを削除
                cursorIdsToRemove.forEach(id => {
                    this.cursorInstances.delete(id);
                });
            }

            // Reactive state を更新
            this.cursors = Object.fromEntries(
                Object.entries(this.cursors).filter(([_, c]) => c.userId !== userId),
            );
        }

        // 選択範囲も削除する場合
        if (clearSelections) {
            this.selections = Object.fromEntries(
                Object.entries(this.selections).filter(([_, s]) => s.userId !== userId),
            );
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Cursors after clearing:`, this.cursors);
        }
    }

    clearCursorInstance(cursorId: string) {
        this.removeCursor(cursorId);
    }

    reset() {
        this.cursors = {};
        this.selections = {};
        this.activeItemId = null;
        this.cursorVisible = true;
        this.animationPaused = false;
        clearTimeout(this.timerId);
    }

    /**
     * 強制的に更新を行う
     * 選択範囲やカーソルの表示が更新されない場合に使用
     */
    forceUpdate() {
        // 選択範囲を一時的にクリアして再設定することで強制的に更新
        const tempSelections = { ...this.selections };
        this.selections = {};

        // 少し待ってから再設定
        setTimeout(() => {
            this.selections = tempSelections;
        }, 0);

        // カーソルも同様に更新
        const tempCursors = { ...this.cursors };
        this.cursors = {};

        setTimeout(() => {
            this.cursors = tempCursors;
        }, 0);
    }

    /**
     * デバッグ用: 現在のカーソル状態をログに出力
     */
    logCursorState() {
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            const cursorInstances = this.getCursorInstances();
            const cursors = Object.values(this.cursors);
            console.log(`=== Cursor State Debug Info ===`);
            console.log(`Current cursor instances: ${cursorInstances.length}`);
            console.log(`Current cursors in store: ${cursors.length}`);
            console.log(`Active item ID: ${this.getActiveItem()}`);
            console.log(`Textarea reference exists: ${!!this.textareaRef}`);
            if (this.textareaRef) {
                console.log(`Textarea has focus: ${document.activeElement === this.textareaRef}`);
            }
            console.log(
                `Cursor instances:`,
                Array.from(this.cursorInstances.entries()).map(([id, cursor]) => ({
                    id,
                    itemId: cursor.itemId,
                    offset: cursor.offset,
                    isActive: cursor.isActive,
                    userId: cursor.userId,
                })),
            );
            console.log(`Cursors:`, cursors);
            console.log(`=== End Debug Info ===`);
        }
    }

    getItemCursorsAndSelections(itemId: string) {
        const itemCursors = Object.values(this.cursors).filter((c: CursorPosition) => c.itemId === itemId);
        const itemSelections = Object.values(this.selections).filter(
            (s: SelectionRange) => s.startItemId === itemId || s.endItemId === itemId,
        );
        const isActive = this.activeItemId === itemId;
        return { cursors: itemCursors, selections: itemSelections, isActive };
    }

    /**
     * 新しいカーソルを設定する
     * @param cursorProps カーソルのプロパティ
     * @returns 新しいカーソルのID
     */
    setCursor(cursorProps: Omit<CursorPosition, "cursorId">) {
        const userId = cursorProps.userId ?? "local";
        const itemId = cursorProps.itemId;

        // 同じユーザーの同じアイテムに対する既存のカーソルをクリア
        const cursorIdsToRemove: string[] = [];
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.userId === userId && inst.itemId === itemId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // 特定したカーソルをすべて削除
        if (cursorIdsToRemove.length > 0) {
            // Map からインスタンスを削除
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.delete(id);
            });

            // Reactive state を更新
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;
        }

        // 新しいカーソルを作成
        const id = this.genUUID();

        // Cursor インスタンスを生成して保持
        const cursorInst = new Cursor(id, {
            itemId: cursorProps.itemId,
            offset: cursorProps.offset,
            isActive: cursorProps.isActive,
            userId: userId,
        });
        this.cursorInstances.set(id, cursorInst);

        // Reactive state を更新
        const newCursor: CursorPosition = {
            cursorId: id,
            ...cursorProps,
            userId: userId, // userId が undefined の場合に "local" を設定
        };
        this.cursors = { ...this.cursors, [id]: newCursor };

        // アクティブなカーソルの場合はアクティブアイテムを更新
        if (cursorProps.isActive) {
            this.setActiveItem(itemId);
        }

        return id;
    }

    clearCursorForItem(itemId: string) {
        // 削除対象のカーソルIDを収集
        const cursorIdsToRemove: string[] = [];

        // Map から一致するインスタンスを特定
        for (const [cursorId, inst] of this.cursorInstances.entries()) {
            if (inst.itemId === itemId) {
                cursorIdsToRemove.push(cursorId);
            }
        }

        // 特定したカーソルをすべて削除
        if (cursorIdsToRemove.length > 0) {
            // Map からインスタンスを削除
            cursorIdsToRemove.forEach(id => {
                this.cursorInstances.delete(id);
            });

            // Reactive state を一度に更新
            const newCursors = { ...this.cursors };
            cursorIdsToRemove.forEach(id => {
                delete newCursors[id];
            });
            this.cursors = newCursors;
        }
    }

    // 登録された Cursor インスタンスを取得する
    getCursorInstances(): import("../lib/Cursor").Cursor[] {
        return Array.from(this.cursorInstances.values());
    }

    /**
     * 選択範囲内のテキストを取得する
     * @param userId ユーザーID（デフォルトは"local"）
     * @returns 選択範囲内のテキスト。選択範囲がない場合は空文字列を返す
     */
    getSelectedText(userId = "local"): string {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getSelectedText called for userId=${userId}`);
        }

        // 指定されたユーザーの選択範囲を取得
        const selections = Object.values(this.selections).filter(s =>
            s.userId === userId || (!s.userId && userId === "local")
        );
        if (selections.length === 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`No selections found for userId=${userId}`);
                console.log(`Available selections:`, this.selections);
            }
            return "";
        }

        let selectedText = "";

        // 各選択範囲を処理
        for (const sel of selections) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Processing selection:`, sel);
            }

            try {
                if (sel.isBoxSelection && sel.boxSelectionRanges) {
                    // 矩形選択（ボックス選択）の場合
                    selectedText += this.getTextFromBoxSelection(sel);
                }
                else if (sel.startItemId === sel.endItemId) {
                    // 単一アイテム内の選択範囲
                    selectedText += this.getTextFromSingleItemSelection(sel);
                }
                else {
                    // 複数アイテムにまたがる選択範囲
                    selectedText += this.getTextFromMultiItemSelection(sel);
                }
            }
            catch (error) {
                // エラーが発生した場合はログに出力
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Error in getSelectedText:`, error);
                    if (error instanceof Error) {
                        console.error(`Error message: ${error.message}`);
                        console.error(`Error stack: ${error.stack}`);
                    }
                }
                // エラーが発生しても処理を続行
                continue;
            }
        }

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Final selected text: "${selectedText}"`);
        }

        return selectedText;
    }

    /**
     * 単一アイテム内の選択範囲からテキストを取得する
     * @param sel 選択範囲
     * @returns 選択範囲内のテキスト
     */
    private getTextFromSingleItemSelection(sel: SelectionRange): string {
        const textEl = document.querySelector(`[data-item-id="${sel.startItemId}"] .item-text`) as HTMLElement;
        if (!textEl) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Text element not found for item ${sel.startItemId}`);
            }
            return "";
        }

        const text = textEl.textContent || "";
        const startOffset = Math.min(sel.startOffset, sel.endOffset);
        const endOffset = Math.max(sel.startOffset, sel.endOffset);

        // 選択範囲が有効かチェック
        if (startOffset === endOffset) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Empty selection for item ${sel.startItemId}`);
            }
            return "";
        }

        // オフセットが範囲内かチェック
        if (startOffset < 0 || endOffset > text.length) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Invalid offsets for item ${sel.startItemId}: startOffset=${startOffset}, endOffset=${endOffset}, text.length=${text.length}`,
                );
            }
            // 範囲外の場合は修正
            const safeStartOffset = Math.max(0, Math.min(text.length, startOffset));
            const safeEndOffset = Math.max(0, Math.min(text.length, endOffset));
            return text.substring(safeStartOffset, safeEndOffset);
        }
        else {
            return text.substring(startOffset, endOffset);
        }
    }

    /**
     * 選択範囲からテキストを取得する
     * @param sel 選択範囲
     * @returns 選択範囲内のテキスト
     */
    getTextFromSelection(sel: SelectionRange): string {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getTextFromSelection called with:`, sel);
        }

        try {
            if (sel.isBoxSelection && sel.boxSelectionRanges) {
                // 矩形選択（ボックス選択）の場合
                return this.getTextFromBoxSelection(sel);
            }
            else if (sel.startItemId === sel.endItemId) {
                // 単一アイテム内の選択範囲
                return this.getTextFromSingleItemSelection(sel);
            }
            else {
                // 複数アイテムにまたがる選択範囲
                return this.getTextFromMultiItemSelection(sel);
            }
        }
        catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in getTextFromSelection:`, error);
                if (error instanceof Error) {
                    console.error(`Error message: ${error.message}`);
                    console.error(`Error stack: ${error.stack}`);
                }
            }
            // エラーが発生した場合は空文字列を返す
            return "";
        }
    }

    /**
     * 矩形選択（ボックス選択）からテキストを取得する
     * @param sel 選択範囲
     * @returns 選択範囲内のテキスト
     */
    private getTextFromBoxSelection(sel: SelectionRange): string {
        if (!sel.boxSelectionRanges || sel.boxSelectionRanges.length === 0) {
            return "";
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getTextFromBoxSelection called with:`, sel);
        }

        // 各行のテキストを取得
        const lines: string[] = [];

        for (const range of sel.boxSelectionRanges) {
            const textEl = document.querySelector(`[data-item-id="${range.itemId}"] .item-text`) as HTMLElement;
            if (!textEl) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Text element not found for item ${range.itemId}`);
                }
                lines.push(""); // 空行を追加
                continue;
            }

            const text = textEl.textContent || "";
            const startOffset = Math.min(range.startOffset, range.endOffset);
            const endOffset = Math.max(range.startOffset, range.endOffset);

            // 選択範囲が有効かチェック
            if (startOffset === endOffset) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Empty selection for item ${range.itemId}`);
                }
                lines.push(""); // 空行を追加
                continue;
            }

            // オフセットが範囲内かチェック
            if (startOffset < 0 || endOffset > text.length) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(
                        `Invalid offsets for item ${range.itemId}: startOffset=${startOffset}, endOffset=${endOffset}, text.length=${text.length}`,
                    );
                }
                // 範囲外の場合は修正
                const safeStartOffset = Math.max(0, Math.min(text.length, startOffset));
                const safeEndOffset = Math.max(0, Math.min(text.length, endOffset));
                lines.push(text.substring(safeStartOffset, safeEndOffset));
            }
            else {
                lines.push(text.substring(startOffset, endOffset));
            }
        }

        // VS Codeの矩形選択の場合、各行を改行で連結
        return lines.join("\n");
    }

    /**
     * 複数アイテムにまたがる選択範囲からテキストを取得する
     * @param sel 選択範囲
     * @returns 選択範囲内のテキスト
     */
    private getTextFromMultiItemSelection(sel: SelectionRange): string {
        // アイテムIDとインデックスのマッピングを作成（キャッシュ利用）
        const { itemIdToIndex, allItems } = this.getItemsMapping();

        // 開始アイテムと終了アイテムのインデックスを取得
        const sIdx = itemIdToIndex.get(sel.startItemId) ?? -1;
        const eIdx = itemIdToIndex.get(sel.endItemId) ?? -1;

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Start index: ${sIdx}, End index: ${eIdx}`);
        }

        // インデックスが見つからない場合は空文字列を返す
        if (sIdx === -1 || eIdx === -1) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Invalid indices, skipping selection`);
            }
            return "";
        }

        // 選択範囲の開始と終了のインデックスを決定
        const firstIdx = Math.min(sIdx, eIdx);
        const lastIdx = Math.max(sIdx, eIdx);

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`First index: ${firstIdx}, Last index: ${lastIdx}, isReversed: ${sel.isReversed || false}`);
        }

        // 選択範囲内の全てのアイテムを取得
        const itemsInRange = allItems.slice(firstIdx, lastIdx + 1);

        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Items in range: ${itemsInRange.length}`);
            console.log(`Items in range:`, itemsInRange.map(item => item.getAttribute("data-item-id")));
        }

        let result = "";

        // 選択範囲内の各アイテムを処理
        for (let i = 0; i < itemsInRange.length; i++) {
            const item = itemsInRange[i];
            const itemId = item.getAttribute("data-item-id")!;
            const textEl = item.querySelector(".item-text") as HTMLElement;

            if (!textEl) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Text element not found for item ${itemId}`);
                }
                continue;
            }

            const text = textEl.textContent || "";
            const len = text.length;

            // オフセット計算
            let startOff = 0;
            let endOff = len;

            // 開始アイテム
            if (itemId === sel.startItemId) {
                startOff = Math.max(0, Math.min(len, sel.startOffset));
            }

            // 終了アイテム
            if (itemId === sel.endItemId) {
                endOff = Math.max(0, Math.min(len, sel.endOffset));
            }

            // テキストを追加（有効な範囲のみ）
            if (startOff < endOff) {
                const itemText = text.substring(startOff, endOff);
                result += itemText;

                // 最後のアイテム以外は改行を追加
                if (i < itemsInRange.length - 1) {
                    result += "\n";
                }
            }
        }

        return result;
    }

    // アイテムIDとインデックスのマッピングをキャッシュするためのプロパティ
    private _itemsMappingCache: {
        itemIdToIndex: Map<string, number>;
        allItems: HTMLElement[];
        timestamp: number;
    } | null = null;

    /**
     * アイテムIDとインデックスのマッピングを取得する（キャッシュ付き）
     * @returns アイテムIDとインデックスのマッピング
     */
    private getItemsMapping(): { itemIdToIndex: Map<string, number>; allItems: HTMLElement[]; } {
        // キャッシュが有効かチェック（100ms以内に作成されたものは再利用）
        const now = Date.now();
        if (this._itemsMappingCache && now - this._itemsMappingCache.timestamp < 100) {
            return {
                itemIdToIndex: this._itemsMappingCache.itemIdToIndex,
                allItems: this._itemsMappingCache.allItems,
            };
        }

        // 全てのアイテムを取得
        const allItems = Array.from(document.querySelectorAll("[data-item-id]")) as HTMLElement[];

        // アイテムIDとインデックスのマッピングを作成
        const itemIdToIndex = new Map<string, number>();
        allItems.forEach((el, index) => {
            const id = el.getAttribute("data-item-id");
            if (id) itemIdToIndex.set(id, index);
        });

        // キャッシュを更新
        this._itemsMappingCache = {
            itemIdToIndex,
            allItems,
            timestamp: now,
        };

        return { itemIdToIndex, allItems };
    }

    // Command Palette Methods
    showCommandPalette(itemId: string, offset: number, position: { top: number; left: number } | null = null) {
        this.commandPaletteVisible = true;
        this.commandPaletteItemId = itemId;
        this.commandPaletteOffset = offset;
        if (position) {
            this.commandPalettePosition = position;
        }
    }

    hideCommandPalette() {
        this.commandPaletteVisible = false;
        this.commandPaletteItemId = null;
        this.commandPaletteOffset = 0;
        this.commandPalettePosition = null;
    }

    setCommandPalettePosition(position: { top: number; left: number } | null) {
        this.commandPalettePosition = position;
    }

    getCommandPaletteState() {
        return {
            visible: this.commandPaletteVisible,
            itemId: this.commandPaletteItemId,
            offset: this.commandPaletteOffset,
            position: this.commandPalettePosition,
        };
    }
}

export const editorOverlayStore = new EditorOverlayStore();

// テスト用にグローバルスコープに公開
if (typeof window !== "undefined") {
    (window as any).editorOverlayStore = editorOverlayStore;
}
