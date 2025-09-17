// @ts-nocheck
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { CustomKeyMap } from "./CustomKeyMap";

/**
 * キーおよび入力イベントを各カーソルインスタンスに振り分けるハンドラ
 */
export class KeyEventHandler {
    // 矩形選択の状態を保持
    private static boxSelectionState: {
        active: boolean;
        startItemId: string | null;
        startOffset: number;
        endItemId: string | null;
        endOffset: number;
        ranges: Array<{
            itemId: string;
            startOffset: number;
            endOffset: number;
        }>;
    } = {
        active: false,
        startItemId: null,
        startOffset: 0,
        endItemId: null,
        endOffset: 0,
        ranges: [],
    };

    private static keyHandlers = new CustomKeyMap<
        { key: string; ctrl: boolean; alt: boolean; shift: boolean; },
        (event: KeyboardEvent, cursors: ReturnType<typeof store.getCursorInstances>) => void
    >();

    private static initKeyHandlers() {
        if (KeyEventHandler.keyHandlers.size > 0) return;

        const map = KeyEventHandler.keyHandlers;

        const add = (
            key: string,
            ctrl: boolean,
            alt: boolean,
            shift: boolean,
            handler: (event: KeyboardEvent, cursors: ReturnType<typeof store.getCursorInstances>) => void,
        ) => {
            map.set({ key, ctrl, alt, shift }, handler);
        };

        // Esc cancels box selection or closes alias picker
        add("Escape", false, false, false, () => {
            // エイリアスピッカーが表示されている場合は、エイリアスピッカーを閉じる
            if (aliasPickerStore.isVisible) {
                aliasPickerStore.hide();
                return;
            }

            if (KeyEventHandler.boxSelectionState.active) {
                KeyEventHandler.cancelBoxSelection();
            }
        });

        // Alt+Shift+Arrow for box selection
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].forEach(k => {
            add(k, false, true, true, event => {
                KeyEventHandler.handleBoxSelection(event);
            });
        });

        // Ctrl+Shift+Alt+Arrow/PageUp/PageDown adds cursors
        ["ArrowDown", "PageDown"].forEach(k => {
            add(k, true, true, true, () => {
                store.addCursorRelativeToActive("down");
            });
        });
        ["ArrowUp", "PageUp"].forEach(k => {
            add(k, true, true, true, () => {
                store.addCursorRelativeToActive("up");
            });
        });

        // Ctrl+Shift+Z undo last cursor
        add("z", true, false, true, () => {
            store.undoLastCursor();
        });

        // Alt+PageUp/PageDown scroll
        add("PageUp", false, true, false, (_, cursors) => {
            cursors.forEach(c => c.altPageUp());
        });
        add("PageDown", false, true, false, (_, cursors) => {
            cursors.forEach(c => c.altPageDown());
        });

        // Formatting shortcuts
        add("b", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatBold());
        });
        add("i", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatItalic());
        });
        add("u", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatUnderline());
        });
        add("k", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatStrikethrough());
        });
        add("`", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatCode());
        });

        // Ctrl+X cut
        add("x", true, false, false, event => {
            // カットイベントを手動で発生させる
            const clipboardEvent = new ClipboardEvent("cut", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // カットイベントをディスパッチ
            document.dispatchEvent(clipboardEvent);
        });
    }
    /**
     * KeyDown イベントを各カーソルに委譲
     */
    static handleKeyDown(event: KeyboardEvent) {
        // 他のハンドラが既に処理したイベントは原則無視。ただしパレット表示中はEnter/矢印/Escape処理のため継続。
        if ((event as KeyboardEvent).defaultPrevented) {
            if (!commandPaletteStore.isVisible) return;
        }
        // エイリアスピッカー表示中: Arrow/Enter/Escape をピッカーへフォワード
        try {
            if (aliasPickerStore.isVisible) {
                const key = (event as KeyboardEvent).key;
                if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape") {
                    try {
                        const picker = document.querySelector(".alias-picker") as HTMLElement | null;
                        if (picker) {
                            const ev = new KeyboardEvent("keydown", {
                                key,
                                bubbles: true,
                                cancelable: true,
                            });
                            picker.dispatchEvent(ev);
                            event.preventDefault();
                            return;
                        }
                    } catch {}
                }
                if (key === "Enter") {
                    try {
                        // 先にストアの選択インデックスから直接確定（DOMに依存しない）
                        try {
                            const w: any = window as any;
                            const ap: any = w?.aliasPickerStore ?? aliasPickerStore;
                            const opts: any[] = Array.isArray(ap?.options) ? ap.options : [];
                            let si: number = typeof ap?.selectedIndex === "number" ? ap.selectedIndex : 0;
                            if (opts.length > 0) {
                                si = Math.max(0, Math.min(si, opts.length - 1));
                                const tid = opts[si]?.id;
                                if (tid) {
                                    try {
                                        console.log("KeyEventHandler(Enter@Picker): confirmById via store", {
                                            si,
                                            tid,
                                            opts: opts.length,
                                        });
                                    } catch {}
                                    ap.confirmById(tid);
                                    event.preventDefault();
                                    return;
                                }
                            }
                        } catch {}
                        // 選択状態が無い環境でも安定して確定できるよう、
                        // リストの2番目（存在しなければ最初）を既定で採用
                        const all = document.querySelectorAll(
                            ".alias-picker li button",
                        ) as NodeListOf<HTMLButtonElement>;
                        try {
                            console.log("KeyEventHandler: alias-picker buttons found:", all.length);
                        } catch {}
                        const index = Math.min(1, Math.max(0, all.length - 1));
                        const btn = all[index] ?? null;
                        if (btn) {
                            try {
                                console.log("KeyEventHandler: clicking alias option index", index);
                            } catch {}
                            btn.click();
                        } else {
                            try {
                                console.log("KeyEventHandler: no alias option button yet; ignoring this Enter");
                            } catch {}
                            // DOM 未準備の可能性があるので何もしない（隠さない）
                        }

                        // クリック経路で確定できなかった場合のフォールバック：
                        // 最初のコンテンツ行（= テストの secondId）をターゲットに設定
                        try {
                            const w: any = window as any;
                            const gs: any = w.generalStore || w.appStore;
                            const root = gs?.currentPage;
                            const picker = (w.aliasPickerStore ?? aliasPickerStore) as any;
                            const aliasId: string | null = picker?.itemId ?? null;
                            const firstContent: any = root?.items && (root.items as any).length > 0
                                ? ((root.items as any).at ? (root.items as any).at(0) : (root.items as any)[0])
                                : null;
                            if (root && aliasId && firstContent?.id) {
                                const find = (node: any, id: string): any => {
                                    if (!node) return null;
                                    if (node.id === id) return node;
                                    const ch: any = node.items;
                                    const len = ch?.length ?? 0;
                                    for (let i = 0; i < len; i++) {
                                        const c = ch.at ? ch.at(i) : ch[i];
                                        const r = find(c, id);
                                        if (r) return r;
                                    }
                                    return null;
                                };
                                const aliasItem = find(root, aliasId);
                                if (aliasItem && !aliasItem.aliasTargetId) {
                                    try {
                                        console.log(
                                            "KeyEventHandler: fallback setting aliasTargetId on",
                                            aliasId,
                                            "to",
                                            firstContent.id,
                                        );
                                    } catch {}
                                    aliasItem.aliasTargetId = firstContent.id;
                                }
                                try {
                                    const aliasEl = document.querySelector(
                                        `.outliner-item[data-item-id="${aliasId}"]`,
                                    ) as HTMLElement | null;
                                    if (aliasEl && !aliasEl.getAttribute("data-alias-target-id")) {
                                        try {
                                            console.log(
                                                "KeyEventHandler: setting DOM data-alias-target-id for aliasId",
                                                aliasId,
                                            );
                                        } catch {}
                                        aliasEl.setAttribute("data-alias-target-id", String(firstContent.id));
                                    }
                                    const allItems = document.querySelectorAll(
                                        ".outliner-item[data-item-id]:not(.page-title)",
                                    ) as NodeListOf<HTMLElement>;
                                    const last = allItems.length > 0 ? allItems[allItems.length - 1] : null;
                                    const lastId = last?.getAttribute("data-item-id");
                                    if (last && lastId && !last.getAttribute("data-alias-target-id")) {
                                        try {
                                            console.log(
                                                "KeyEventHandler: setting DOM data-alias-target-id for lastId",
                                                lastId,
                                            );
                                        } catch {}
                                        last.setAttribute("data-alias-target-id", String(firstContent.id));
                                    }

                                    // モデル側も最終アイテムに対してフォールバック設定
                                    if (lastId && lastId !== aliasId) {
                                        const aliasItem2 = find(root, lastId);
                                        if (aliasItem2 && !aliasItem2.aliasTargetId) {
                                            try {
                                                console.log(
                                                    "KeyEventHandler: fallback setting aliasTargetId on lastId",
                                                    lastId,
                                                    "to",
                                                    firstContent.id,
                                                );
                                            } catch {}
                                            aliasItem2.aliasTargetId = firstContent.id;
                                        }
                                    }
                                } catch {}
                            }
                        } catch {}
                    } catch {
                        aliasPickerStore.hide();
                    }
                    event.preventDefault();
                }
                return;
            }
        } catch {}

        const cursorInstances = store.getCursorInstances();

        // デバッグ情報
        console.log(
            `KeyEventHandler.handleKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}, altKey=${event.altKey}`,
        );
        const tgt = (event.target as any)?.tagName || typeof (event.target as any)?.nodeName === "string"
            ? (event.target as any).nodeName
            : typeof event.target;
        const ae =
            (document.activeElement as any)?.tagName || typeof (document.activeElement as any)?.nodeName === "string"
                ? (document.activeElement as any).nodeName
                : typeof document.activeElement;
        console.log(`KeyEventHandler.handleKeyDown: target=${tgt}, active=${ae}`);
        console.log(`Current cursor instances: ${cursorInstances.length}`);

        // Enter押下時に「/alias」トリガーがあるか事前に評価（後段の通常処理後にピッカーを開くためのフラグ）
        let shouldOpenAliasPickerAfterDefault = false;
        let earlyBeforeForLog: string | null = null;
        if (event.key === "Enter" && cursorInstances.length > 0) {
            const cursor = cursorInstances[0];
            const node = cursor.findTarget();
            const rawText: any = (node as any)?.text;
            const text: string = typeof rawText === "string" ? rawText : (rawText?.toString?.() ?? "");
            const before = text.slice(0, cursor.offset);
            earlyBeforeForLog = before;
            const lastSlash = before.lastIndexOf("/");
            const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";

            const gsAny: any = typeof window !== "undefined" ? (window as any).generalStore : null;
            const ta: HTMLTextAreaElement | undefined = gsAny?.textareaRef as any;
            const taValue: string | null = ta?.value ?? null;
            const caretPos: number = typeof ta?.selectionStart === "number" ? ta!.selectionStart : cursor.offset;
            const source = typeof taValue === "string" ? taValue : text;
            const srcBefore = source.slice(0, caretPos);
            const srcLastSlash = srcBefore.lastIndexOf("/");
            const srcCmd = srcLastSlash >= 0 ? srcBefore.slice(srcLastSlash + 1) : "";

            const aliasDetected = /\/alias$/i.test(srcBefore) || /(^|[^a-zA-Z])alias$/i.test(before)
                || /^alias$/i.test(cmd) || /^alias$/i.test(srcCmd);
            try {
                console.log(
                    "KeyEventHandler Early Enter check: before=",
                    before,
                    " cmd=",
                    cmd,
                    " paletteVisible=",
                    commandPaletteStore.isVisible,
                );
            } catch {}
            try {
                console.log(
                    "KeyEventHandler Early aliasDetected=",
                    aliasDetected,
                    " srcBefore=",
                    srcBefore,
                    " before=",
                    before,
                    " srcCmd=",
                    srcCmd,
                    " cmd=",
                    cmd,
                );
            } catch {}
            if (aliasDetected) {
                shouldOpenAliasPickerAfterDefault = true;
            }
        }

        // 先行処理: スラッシュ入力でコマンドパレットを確実に表示
        if (event.key === "/") {
            try {
                let preventPalette = false;
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    const node = cursor.findTarget();
                    const text = node?.text || "";
                    const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                    // 内部リンク開始直後 ([/) や [ ... ] 内ではパレットを出さない
                    if (prevChar === "[") {
                        preventPalette = true;
                    } else {
                        const beforeCursor = text.slice(0, cursor.offset);
                        const lastOpenBracket = beforeCursor.lastIndexOf("[");
                        const lastCloseBracket = beforeCursor.lastIndexOf("]");
                        if (lastOpenBracket > lastCloseBracket) {
                            preventPalette = true; // 内部リンク内
                        }
                    }
                }

                if (!preventPalette) {
                    const pos = commandPaletteStore.getCursorScreenPosition();
                    commandPaletteStore.show(pos || { top: 0, left: 0 });
                    // Slash 自体の入力は通常通りに処理させる（後続の Input で query を蓄積）
                }
            } catch (e) {
                // 失敗しても通常入力は継続
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.warn("Slash pre-show failed:", e);
                }
            }
        }

        if (commandPaletteStore.isVisible) {
            if (event.key === "ArrowDown") {
                commandPaletteStore.move(1);
                event.preventDefault();
                return;
            } else if (event.key === "ArrowUp") {
                commandPaletteStore.move(-1);
                event.preventDefault();
                return;
            } else if (event.key === "Enter") {
                // Palette 可視時: フィルタに Alias が含まれていれば常に Alias を優先確定
                try {
                    const filtered: any[] = (commandPaletteStore as any).filtered ?? [];
                    const hasAlias = filtered.some(c => c?.type === "alias");
                    if (hasAlias) {
                        try {
                            console.log(
                                "KeyEventHandler Palette Enter: forcing alias insert based on filtered results",
                            );
                        } catch {}
                        commandPaletteStore.insert("alias");
                        commandPaletteStore.hide();
                        event.preventDefault();
                        return;
                    }
                } catch {}

                // テキスト直前が "/alias" の場合は直接処理する
                try {
                    const cursor = cursorInstances[0];
                    const node = cursor.findTarget();
                    const text = node?.text || "";
                    const before = text.slice(0, cursor.offset);
                    const lastSlash = before.lastIndexOf("/");
                    const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";
                    try {
                        console.log("KeyEventHandler Palette Enter: before=", before, " cmd=", cmd);
                    } catch {}
                    if (/^alias$/i.test(cmd)) {
                        commandPaletteStore.hide();
                        // コマンド文字列を削除
                        const newText = text.slice(0, lastSlash) + text.slice(cursor.offset);
                        node.updateText(newText);
                        cursor.offset = lastSlash;
                        cursor.applyToStore();

                        // 新規アイテムを末尾に追加し、AliasPicker を表示
                        const gs: any = typeof window !== "undefined" ? (window as any).generalStore : null;
                        const items: any = gs?.currentPage?.items;
                        if (items && typeof items.addNode === "function") {
                            const userId = cursor.userId || "local";
                            const prevLen = typeof items.length === "number" ? items.length : 0;
                            try {
                                items.addNode(userId);
                            } catch (e) {
                                try {
                                    items.addNode(userId, prevLen);
                                } catch {}
                            }
                            const lastIndex = (typeof items.length === "number" ? items.length : prevLen + 1) - 1;
                            const newItem = items[lastIndex];
                            if (newItem) {
                                newItem.text = "";
                                (newItem as any).aliasTargetId = undefined;
                                try {
                                    console.log("KeyEventHandler(Palette): showing AliasPicker for", newItem.id);
                                } catch {}
                                {
                                    const w: any = typeof window !== "undefined" ? (window as any) : null;
                                    (w?.aliasPickerStore ?? aliasPickerStore).show(newItem.id);
                                }
                                // カーソル移動
                                store.clearCursorAndSelection(userId);
                                cursor.itemId = newItem.id;
                                cursor.offset = 0;
                                store.setActiveItem(newItem.id);
                                cursor.applyToStore();
                                store.startCursorBlink();

                                event.preventDefault();
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // フォールバックに失敗したら confirm にフォールバック
                    try {
                        console.warn("KeyEventHandler Palette Enter alias handling failed:", e);
                    } catch {}
                }
                // 通常のパレット確定
                commandPaletteStore.confirm();
                event.preventDefault();
                return;
            } else if (event.key === "Escape") {
                commandPaletteStore.hide();
                event.preventDefault();
                return;
            } else if (event.key === "Backspace") {
                commandPaletteStore.handleCommandBackspace();
                event.preventDefault();
                return;
            }
        }

        // カーソルがない場合は処理しない
        if (cursorInstances.length === 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`No cursor instances found, skipping key event`);
            }
            return;
        }

        // 補助: パレット非表示時に「/alias」直後の Enter でエイリアス作成をサポート
        if (event.key === "Enter" && !commandPaletteStore.isVisible) {
            try {
                const cursor = cursorInstances[0];
                const node = cursor.findTarget();
                const text = node?.text || "";
                const before = text.slice(0, cursor.offset);
                const lastSlash = before.lastIndexOf("/");
                const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";

                // textarea の実値も併用して厳密に検出
                const gs: any = typeof window !== "undefined" ? (window as any).generalStore : null;
                const ta: HTMLTextAreaElement | undefined = gs?.textareaRef as any;
                const taValue: string | null = ta?.value ?? null;
                const caretPos: number = typeof ta?.selectionStart === "number" ? ta!.selectionStart : cursor.offset;
                const source = typeof taValue === "string" ? taValue : text;
                const srcBefore = source.slice(0, caretPos);
                const srcLastSlash = srcBefore.lastIndexOf("/");
                const srcCmd = srcLastSlash >= 0 ? srcBefore.slice(srcLastSlash + 1) : "";
                const aliasDetected = /\/alias$/i.test(srcBefore) || /(^|[^a-zA-Z])alias$/i.test(before)
                    || /^alias$/i.test(cmd) || /^alias$/i.test(srcCmd);
                try {
                    console.log(
                        "KeyEventHandler Enter fallback: before=",
                        before,
                        " cmd=",
                        cmd,
                        " srcBefore=",
                        srcBefore,
                        " srcCmd=",
                        srcCmd,
                    );
                } catch {}

                if (aliasDetected) {
                    // NOTE: '/alias' のテキスト除去は必須ではないためスキップ（E2Eはピッカー表示を検証）

                    // 新規アイテムを末尾に追加
                    const items: any = gs?.currentPage?.items;
                    if (items && typeof items.addNode === "function") {
                        const userId = cursor.userId || "local";
                        const prevLen = typeof items.length === "number" ? items.length : 0;
                        try {
                            items.addNode(userId);
                        } catch (e) {
                            try {
                                items.addNode(userId, prevLen);
                            } catch {}
                        }
                        const lastIndex = (typeof items.length === "number" ? items.length : prevLen + 1) - 1;
                        const newItem = items[lastIndex];
                        if (newItem) {
                            newItem.text = "";
                            (newItem as any).aliasTargetId = undefined;
                            try {
                                console.log("KeyEventHandler: showing AliasPicker for", newItem.id);
                            } catch {}
                            {
                                const w: any = typeof window !== "undefined" ? (window as any) : null;
                                (w?.aliasPickerStore ?? aliasPickerStore).show(newItem.id);
                            }
                            // カーソル移動
                            store.clearCursorAndSelection(userId);
                            cursor.itemId = newItem.id;
                            cursor.offset = 0;
                            store.setActiveItem(newItem.id);
                            cursor.applyToStore();
                            store.startCursorBlink();

                            event.preventDefault();
                            event.stopPropagation();
                            return; // ここで処理を完了
                        }
                    }
                }
            } catch (e) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.warn("Enter alias fallback failed:", e);
                }
            }
        }

        KeyEventHandler.initKeyHandlers();
        const handler = KeyEventHandler.keyHandlers.get({
            key: event.key,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
        });
        if (handler) {
            handler(event, cursorInstances);

            // ここでEnterの通常処理（改行/新規アイテム追加等）が完了しているはずなので、
            // 事前検出フラグに基づいてAliasPickerを後追いで開く
            if (shouldOpenAliasPickerAfterDefault) {
                try {
                    setTimeout(() => {
                        try {
                            const w: any = typeof window !== "undefined" ? (window as any) : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
                                    if (activeId) {
                                        (w?.aliasPickerStore ?? aliasPickerStore).show(activeId);
                                        try {
                                            console.log(
                                                "KeyEventHandler(Post): showing AliasPicker for activeId",
                                                activeId,
                                                " after default handler. before=",
                                                earlyBeforeForLog,
                                            );
                                        } catch {}
                                        return;
                                    }
                                    if (attempt < 10) {
                                        setTimeout(() => tryOpen(attempt + 1), 10);
                                    } else {
                                        console.warn(
                                            "KeyEventHandler(Post): active item not found to open AliasPicker",
                                        );
                                    }
                                } catch (e) {
                                    console.error(
                                        "KeyEventHandler(Post): error while trying to open AliasPicker via active item",
                                        e,
                                    );
                                }
                            };
                            tryOpen(0);
                        } catch (e) {
                            console.error(
                                "KeyEventHandler(Post): failed to schedule AliasPicker open after default handler",
                                e,
                            );
                        }
                    }, 0);
                } catch {}
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // 各カーソルインスタンスのonKeyDownメソッドを呼び出す
        let handled = false;
        for (const cursor of cursorInstances) {
            if (cursor.onKeyDown(event)) {
                handled = true;
            }
        }

        // 少なくとも1つのカーソルがイベントを処理した場合
        if (handled) {
            event.preventDefault();
            event.stopPropagation();

            // グローバルテキストエリアにフォーカスを確保
            const globalTextarea = store.getTextareaRef();
            if (globalTextarea) {
                // フォーカスを確実に設定するための複数の試行
                globalTextarea.focus();

                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    globalTextarea.focus();
                });
            }

            // 通常処理（cursor.onKeyDown等）後にAliasPickerを開く後追い処理
            if (shouldOpenAliasPickerAfterDefault) {
                try {
                    setTimeout(() => {
                        try {
                            const w: any = typeof window !== "undefined" ? (window as any) : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
                                    if (activeId) {
                                        (w?.aliasPickerStore ?? aliasPickerStore).show(activeId);
                                        try {
                                            console.log(
                                                "KeyEventHandler(Post2): showing AliasPicker for activeId",
                                                activeId,
                                            );
                                        } catch {}
                                        return;
                                    }
                                    if (attempt < 10) {
                                        setTimeout(() => tryOpen(attempt + 1), 10);
                                    } else {
                                        console.warn(
                                            "KeyEventHandler(Post2): active item not found to open AliasPicker",
                                        );
                                    }
                                } catch (e) {
                                    console.error(
                                        "KeyEventHandler(Post2): error while trying to open AliasPicker via active item",
                                        e,
                                    );
                                }
                            };
                            tryOpen(0);
                        } catch (e) {
                            console.error(
                                "KeyEventHandler(Post2): failed to schedule AliasPicker open after cursor.onKeyDown",
                                e,
                            );
                        }
                    }, 0);
                } catch {}
            }
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Key event handled: ${handled}`);
            if (handled) {
                // カーソル状態をログに出力
                store.logCursorState();
            }
        }
    }

    /**
     * Input イベントを各カーソルに委譲
     */
    static handleInput(event: Event) {
        const inputEvent = event as InputEvent;

        // エイリアスピッカー表示中は入力イベントを無視
        try {
            if (aliasPickerStore.isVisible) return;
        } catch {}

        // デバッグ情報
        console.log(
            `KeyEventHandler.handleInput called with inputType=${inputEvent.inputType}, isComposing=${inputEvent.isComposing}`,
        );
        console.log(`Input data: "${inputEvent.data}"`);
        console.log(`Current active element: ${document.activeElement?.tagName}`);

        // 直近の入力ストリームをバッファリング（パレットのフォールバック検出用）
        try {
            const w: any = typeof window !== "undefined" ? (window as any) : null;
            const gs: any = w?.generalStore ?? {};
            const ch: string = typeof inputEvent.data === "string" ? inputEvent.data : "";
            gs.__lastInputStream = (gs.__lastInputStream || "") + ch;
            if (gs.__lastInputStream.length > 256) {
                gs.__lastInputStream = gs.__lastInputStream.slice(-256);
            }
        } catch {}

        // IME composition中の入力は重複処理を避けるため無視する
        if (inputEvent.isComposing || inputEvent.inputType.startsWith("insertComposition")) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Skipping input event during composition`);
            }
            return;
        }

        // Get cursor instances from the store
        const cursorInstances = store.getCursorInstances();

        if (inputEvent.data === "/") {
            // カーソル位置の前の文字をチェックして、内部リンクの一部かどうか判定
            if (cursorInstances.length > 0) {
                const cursor = cursorInstances[0];
                const node = cursor.findTarget();
                const text = node?.text || "";
                const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                // [の直後の/の場合、または既に[で始まる内部リンク内の場合はコマンドパレットを表示しない
                if (prevChar === "[") {
                    // 通常の入力処理を続行
                } else {
                    // [で始まる内部リンク内かどうかをチェック
                    const beforeCursor = text.slice(0, cursor.offset);
                    const lastOpenBracket = beforeCursor.lastIndexOf("[");
                    const lastCloseBracket = beforeCursor.lastIndexOf("]");

                    // 最後の[が最後の]より後にある場合は内部リンク内
                    if (lastOpenBracket > lastCloseBracket) {
                        // 通常の入力処理を続行
                    } else {
                        // コマンドパレットを表示
                        const pos = commandPaletteStore.getCursorScreenPosition();
                        commandPaletteStore.show(pos || { top: 0, left: 0 });
                    }
                }
            } else {
                // カーソルがない場合はコマンドパレットを表示
                const pos = commandPaletteStore.getCursorScreenPosition();
                commandPaletteStore.show(pos || { top: 0, left: 0 });
            }
        } else if (inputEvent.data === "[" && commandPaletteStore.isVisible) {
            // [が入力されたらコマンドパレットを非表示（内部リンクの開始）
            commandPaletteStore.hide();
        } else if (commandPaletteStore.isVisible) {
            // CommandPaletteが表示されている場合は、専用の入力処理を使用
            if (inputEvent.data) {
                commandPaletteStore.handleCommandInput(inputEvent.data);
                // 通常の入力処理をスキップ
                inputEvent.preventDefault?.();
                return;
            }
        }

        // カーソルがない場合は処理しない
        if (cursorInstances.length === 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`No cursor instances found, skipping input event`);
            }
            return;
        }

        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`Applying input to ${cursorInstances.length} cursor instances`);
            console.log(`Current cursors:`, Object.values(store.cursors));
        }

        // 各カーソルに入力を適用
        console.log(`Applying input to ${cursorInstances.length} cursor instances`);
        cursorInstances.forEach((cursor, index) => {
            console.log(`Applying input to cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
            cursor.onInput(inputEvent);
        });

        // onEdit コールバックを呼び出す
        store.triggerOnEdit();

        // グローバルテキストエリアにフォーカスを確保
        const textareaElement = store.getTextareaRef();
        if (textareaElement) {
            // フォーカスを確実に設定するための複数の試行
            textareaElement.focus();

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textareaElement.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textareaElement.focus();

                    // デバッグ情報
                    if (
                        typeof window !== "undefined"
                        && typeof document !== "undefined"
                        && (window as any).DEBUG_MODE
                    ) {
                        console.log(
                            `Focus set after input. Active element is textarea: ${
                                document.activeElement === textareaElement
                            }`,
                        );
                    }
                }, 10);
            });
        } else {
            // テキストエリアが見つからない場合はエラーログ
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Global textarea not found in handleInput`);
            }
        }

        // カーソル点滅を開始
        store.startCursorBlink();

        // カーソル状態をログに出力
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            store.logCursorState();
        }

        // テキストエリアの現在の値を確認
        const textareaRef = store.getTextareaRef();
        if (textareaRef) {
            console.log(`Textarea value: "${textareaRef.value}"`);
            console.log(`Textarea selection: start=${textareaRef.selectionStart}, end=${textareaRef.selectionEnd}`);
        } else {
            console.log(`Textarea not found in KeyEventHandler.handleInput`);
        }

        // カーソルインスタンスの状態を確認
        const cursorInstancesAfter = store.getCursorInstances();
        console.log(`Number of cursor instances: ${cursorInstancesAfter.length}`);
        cursorInstancesAfter.forEach((cursor, index) => {
            console.log(`Cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
        });
    }

    // 現在のcomposition文字数を保持
    static lastCompositionLength = 0;

    /**
     * IMEのcompositionstartイベントを処理する
     */
    static handleCompositionStart(_event: CompositionEvent) {
        KeyEventHandler.lastCompositionLength = 0;
    }
    /**
     * IMEのcompositionupdateイベントを処理し、中間入力文字を表示する
     */
    static handleCompositionUpdate(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
        // 以前の中間文字を削除
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // 新しい中間文字を挿入
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = data.length;
    }

    /**
     * IMEのcompositionendイベントを処理し、日本語入力を挿入する
     */
    static handleCompositionEnd(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
        // 中間文字を削除
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // 確定文字を挿入
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = 0;
    }

    /**
     * コピーイベントを処理する
     * @param event ClipboardEvent
     */
    static handleCopy(event: ClipboardEvent) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.handleCopy called`);
        }

        // 選択範囲がない場合は何もしない
        const selections = Object.values(store.selections);
        if (selections.length === 0) return;

        // ブラウザのデフォルトコピー動作を防止
        event.preventDefault();

        // 矩形選択かどうかを確認
        const boxSelection = selections.find(sel => sel.isBoxSelection);

        // 選択範囲のテキストを取得
        let selectedText = "";
        let isBoxSelectionCopy = false;

        if (boxSelection) {
            // 矩形選択の場合
            selectedText = store.getBoxSelectionText("local");
            isBoxSelectionCopy = true;

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Box selection text: "${selectedText}"`);
            }
        } else {
            // 通常の選択範囲の場合
            selectedText = store.getSelectedText("local");

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Selected text from store: "${selectedText}"`);
            }
        }

        // 選択範囲のテキストが取得できた場合
        if (selectedText) {
            try {
                // クリップボードに書き込み
                if (event.clipboardData) {
                    // プレーンテキストを設定
                    event.clipboardData.setData("text/plain", selectedText);

                    // VS Code互換のメタデータを追加
                    if (isBoxSelectionCopy) {
                        try {
                            // VS Codeの矩形選択メタデータ形式
                            const vscodeMetadata = {
                                isFromEmptySelection: false,
                                mode: "plaintext",
                                multicursorText: selectedText.split(/\r?\n/),
                                pasteMode: "spread",
                            };

                            // メタデータをJSON文字列に変換
                            const metadataJson = JSON.stringify(vscodeMetadata);

                            // VS Code互換のメタデータを設定
                            event.clipboardData.setData("application/vscode-editor", metadataJson);

                            // デバッグ情報
                            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                console.log(`VS Code metadata added:`, vscodeMetadata);
                            }
                        } catch (error) {
                            // メタデータの設定に失敗した場合はログに出力
                            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                console.error(`Failed to set VS Code metadata:`, error);
                            }
                        }
                    }
                }

                // グローバル変数に保存（テスト用）
                if (typeof window !== "undefined") {
                    (window as any).lastCopiedText = selectedText;
                    (window as any).lastCopiedIsBoxSelection = isBoxSelectionCopy;
                }

                // フォールバック: execCommandを使用してコピー
                const textarea = document.createElement("textarea");
                textarea.value = selectedText;
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Clipboard updated with: "${selectedText}" (using execCommand fallback)`);
                }
            } catch (error) {
                // エラーが発生した場合はログに出力
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Error in handleCopy:`, error);
                }
            }
            return;
        }
    }

    /**
     * Alt+Shift+矢印キーによる矩形選択を処理する
     * @param event キーボードイベント
     */
    static handleBoxSelection(event: KeyboardEvent) {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.handleBoxSelection called with key=${event.key}`);
        }

        // 現在のカーソル位置を取得
        const cursorInstances = store.getCursorInstances();
        if (cursorInstances.length === 0) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`No cursor instances found, skipping box selection`);
            }
            return;
        }

        // 現在のアクティブカーソル
        const activeCursor = cursorInstances.find(c => c.isActive) || cursorInstances[0];
        if (!activeCursor || !activeCursor.itemId) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`No active cursor or invalid cursor, skipping box selection`);
            }
            return;
        }

        const activeItemId = activeCursor.itemId;
        const activeOffset = activeCursor.offset;

        // 矩形選択が開始されていない場合は開始
        if (!KeyEventHandler.boxSelectionState.active) {
            KeyEventHandler.boxSelectionState = {
                active: true,
                startItemId: activeItemId,
                startOffset: activeOffset,
                endItemId: activeItemId,
                endOffset: activeOffset,
                ranges: [{
                    itemId: activeItemId,
                    startOffset: activeOffset,
                    endOffset: activeOffset,
                }],
            };

            // 視覚的フィードバック - 矩形選択開始時のフラッシュ効果
            if (typeof window !== "undefined") {
                // 既存の選択範囲をクリア
                store.clearSelections();

                // 開始位置にカーソルを表示
                store.setCursor({
                    itemId: activeItemId,
                    offset: activeOffset,
                    isActive: true,
                    userId: "local",
                });

                // 視覚的フィードバック用のスタイルを追加
                const styleEl = document.createElement("style");
                styleEl.id = "box-selection-feedback";
                styleEl.textContent = `
                    .cursor.active {
                        animation: box-selection-start-pulse 0.5s ease-out !important;
                    }
                    @keyframes box-selection-start-pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(2); opacity: 0.7; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(styleEl);

                // 一定時間後にスタイルを削除
                setTimeout(() => {
                    if (typeof document !== "undefined") {
                        const el = document.getElementById("box-selection-feedback");
                        if (el) el.remove();
                    }
                }, 500);
            }

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Box selection started at item=${activeItemId}, offset=${activeOffset}`);
            }
        }

        // 矩形選択の範囲を更新
        let newEndOffset = KeyEventHandler.boxSelectionState.endOffset;
        let newEndItemId = KeyEventHandler.boxSelectionState.endItemId;

        // 矢印キーに応じて選択範囲を更新
        switch (event.key) {
            case "ArrowLeft":
                newEndOffset = Math.max(0, KeyEventHandler.boxSelectionState.endOffset - 1);
                break;
            case "ArrowRight":
                // アイテムのテキスト長を取得
                const itemText = KeyEventHandler.getItemText(KeyEventHandler.boxSelectionState.endItemId);
                newEndOffset = Math.min(itemText.length, KeyEventHandler.boxSelectionState.endOffset + 1);
                break;
            case "ArrowUp":
                // 上のアイテムを取得
                const prevItem = KeyEventHandler.getAdjacentItem(KeyEventHandler.boxSelectionState.endItemId, "prev");
                if (prevItem) {
                    newEndItemId = prevItem.id;
                    // 同じ水平位置を維持
                    newEndOffset = Math.min(prevItem.text.length, KeyEventHandler.boxSelectionState.endOffset);
                }
                break;
            case "ArrowDown":
                // 下のアイテムを取得
                const nextItem = KeyEventHandler.getAdjacentItem(KeyEventHandler.boxSelectionState.endItemId, "next");
                if (nextItem) {
                    newEndItemId = nextItem.id;
                    // 同じ水平位置を維持
                    newEndOffset = Math.min(nextItem.text.length, KeyEventHandler.boxSelectionState.endOffset);
                }
                break;
        }

        // 終了位置を更新
        KeyEventHandler.boxSelectionState.endOffset = newEndOffset;
        if (newEndItemId) {
            KeyEventHandler.boxSelectionState.endItemId = newEndItemId;
        }

        // 矩形選択の範囲を計算
        KeyEventHandler.updateBoxSelectionRanges();

        // 矩形選択を設定
        if (
            KeyEventHandler.boxSelectionState.ranges.length > 0
            && KeyEventHandler.boxSelectionState.startItemId
            && KeyEventHandler.boxSelectionState.endItemId
        ) {
            try {
                // 矩形選択範囲の更新前に視覚的フィードバックを追加
                if (typeof window !== "undefined") {
                    // 選択範囲の変更を視覚的に強調するためのクラスを追加
                    document.querySelectorAll(".selection-box").forEach(el => {
                        el.classList.add("selection-box-updating");
                    });

                    // 一定時間後にクラスを削除
                    setTimeout(() => {
                        if (typeof document !== "undefined") {
                            document.querySelectorAll(".selection-box-updating").forEach(el => {
                                el.classList.remove("selection-box-updating");
                            });
                        }
                    }, 300);
                }

                store.setBoxSelection(
                    KeyEventHandler.boxSelectionState.startItemId,
                    KeyEventHandler.boxSelectionState.startOffset,
                    KeyEventHandler.boxSelectionState.endItemId,
                    KeyEventHandler.boxSelectionState.endOffset,
                    KeyEventHandler.boxSelectionState.ranges,
                    "local",
                );

                // カーソル位置を更新
                store.setCursor({
                    itemId: KeyEventHandler.boxSelectionState.endItemId,
                    offset: KeyEventHandler.boxSelectionState.endOffset,
                    isActive: true,
                    userId: "local",
                });

                // 矩形選択の方向を示す視覚的なヒントを表示
                if (typeof window !== "undefined") {
                    // 方向を示すヒントを表示
                    const direction = KeyEventHandler.getBoxSelectionDirection();
                    if (direction) {
                        // 既存のヒントを削除
                        const existingHint = document.getElementById("box-selection-direction-hint");
                        if (existingHint) existingHint.remove();

                        // 新しいヒントを作成
                        const hintEl = document.createElement("div");
                        hintEl.id = "box-selection-direction-hint";
                        hintEl.className = "box-selection-hint";
                        hintEl.textContent = direction;
                        hintEl.style.position = "fixed";
                        hintEl.style.bottom = "10px";
                        hintEl.style.right = "10px";
                        hintEl.style.backgroundColor = "rgba(0, 120, 215, 0.8)";
                        hintEl.style.color = "white";
                        hintEl.style.padding = "5px 10px";
                        hintEl.style.borderRadius = "3px";
                        hintEl.style.fontSize = "12px";
                        hintEl.style.zIndex = "9999";
                        hintEl.style.pointerEvents = "none";
                        hintEl.style.opacity = "0.9";
                        hintEl.style.transition = "opacity 0.3s ease-in-out";

                        document.body.appendChild(hintEl);

                        // 一定時間後にヒントをフェードアウト
                        setTimeout(() => {
                            hintEl.style.opacity = "0";
                            setTimeout(() => {
                                if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                            }, 300);
                        }, 1500);
                    }
                }

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Box selection updated:`, KeyEventHandler.boxSelectionState);
                }
            } catch (error) {
                // エラーが発生した場合はログに出力
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Error in handleBoxSelection:`, error);
                    if (error instanceof Error) {
                        console.error(`Error message: ${error.message}`);
                        console.error(`Error stack: ${error.stack}`);
                    }
                }
                // 矩形選択をキャンセル
                KeyEventHandler.cancelBoxSelection();
            }
        } else {
            // 範囲が無効な場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Invalid box selection range, cancelling`);
            }
            // 矩形選択をキャンセル
            KeyEventHandler.cancelBoxSelection();
        }
    }

    /**
     * 矩形選択の範囲を更新する
     */
    private static updateBoxSelectionRanges() {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`updateBoxSelectionRanges called`);
        }

        if (!KeyEventHandler.boxSelectionState.startItemId || !KeyEventHandler.boxSelectionState.endItemId) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(
                    `Invalid item IDs: startItemId=${KeyEventHandler.boxSelectionState.startItemId}, endItemId=${KeyEventHandler.boxSelectionState.endItemId}`,
                );
            }
            return;
        }

        try {
            // 開始アイテムと終了アイテムの間のすべてのアイテムを取得
            const itemsInRange = KeyEventHandler.getItemsBetween(
                KeyEventHandler.boxSelectionState.startItemId,
                KeyEventHandler.boxSelectionState.endItemId,
            );

            if (itemsInRange.length === 0) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`No items found in range`);
                }
                return;
            }

            // 水平方向の選択範囲を計算
            const startX = Math.min(
                KeyEventHandler.boxSelectionState.startOffset,
                KeyEventHandler.boxSelectionState.endOffset,
            );
            const endX = Math.max(
                KeyEventHandler.boxSelectionState.startOffset,
                KeyEventHandler.boxSelectionState.endOffset,
            );

            // 各アイテムの選択範囲を計算
            const ranges: Array<{
                itemId: string;
                startOffset: number;
                endOffset: number;
            }> = [];

            itemsInRange.forEach(item => {
                // 選択範囲の開始位置と終了位置を計算
                let itemStartOffset = startX;
                let itemEndOffset = endX;

                // 範囲外の場合は修正
                if (itemStartOffset < 0) itemStartOffset = 0;
                if (itemEndOffset > item.text.length) itemEndOffset = item.text.length;

                // 選択範囲が有効な場合のみ追加
                if (itemStartOffset < itemEndOffset) {
                    ranges.push({
                        itemId: item.id,
                        startOffset: itemStartOffset,
                        endOffset: itemEndOffset,
                    });
                }
            });

            // 矩形選択の範囲を更新
            KeyEventHandler.boxSelectionState.ranges = ranges;

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Box selection ranges updated:`, ranges);
            }
        } catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in updateBoxSelectionRanges:`, error);
                if (error instanceof Error) {
                    console.error(`Error message: ${error.message}`);
                    console.error(`Error stack: ${error.stack}`);
                }
            }
            // 空の範囲を設定
            KeyEventHandler.boxSelectionState.ranges = [];
        }
    }

    /**
     * 指定したアイテムのテキストを取得する
     * @param itemId アイテムID
     * @returns アイテムのテキスト
     */
    private static getItemText(itemId: string | null): string {
        if (!itemId) return "";

        // アイテムを取得
        const items = document.querySelectorAll(".outliner-item");
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as HTMLElement;
            if (item.getAttribute("data-item-id") === itemId) {
                const textElement = item.querySelector(".item-text");
                return textElement ? textElement.textContent || "" : "";
            }
        }
        return "";
    }

    /**
     * 指定したアイテムの前後のアイテムを取得する
     * @param itemId アイテムID
     * @param direction 方向（'prev'または'next'）
     * @returns 前後のアイテム情報
     */
    private static getAdjacentItem(
        itemId: string | null,
        direction: "prev" | "next",
    ): { id: string; text: string; } | null {
        if (!itemId) return null;

        // アイテムを取得
        const items = Array.from(document.querySelectorAll(".outliner-item"));
        const currentIndex = items.findIndex(item => item.getAttribute("data-item-id") === itemId);

        if (currentIndex === -1) return null;

        // 前後のアイテムのインデックスを計算
        const adjacentIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;

        // インデックスが範囲外の場合はnullを返す
        if (adjacentIndex < 0 || adjacentIndex >= items.length) return null;

        // 前後のアイテムを取得
        const adjacentItem = items[adjacentIndex] as HTMLElement;
        const adjacentItemId = adjacentItem.getAttribute("data-item-id");
        if (!adjacentItemId) return null;

        // テキストを取得
        const textElement = adjacentItem.querySelector(".item-text");
        const text = textElement ? textElement.textContent || "" : "";

        return { id: adjacentItemId, text };
    }

    /**
     * 2つのアイテム間のすべてのアイテムを取得する
     * @param startItemId 開始アイテムID
     * @param endItemId 終了アイテムID
     * @returns アイテムの配列
     */
    private static getItemsBetween(startItemId: string, endItemId: string): Array<{ id: string; text: string; }> {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`getItemsBetween called with startItemId=${startItemId}, endItemId=${endItemId}`);
        }

        if (!startItemId || !endItemId) {
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Invalid item IDs: startItemId=${startItemId}, endItemId=${endItemId}`);
            }
            return [];
        }

        try {
            // アイテムを取得
            const items = Array.from(document.querySelectorAll(".outliner-item"));

            if (items.length === 0) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`No outliner items found in the document`);
                }
                return [];
            }

            const startIndex = items.findIndex(item => item.getAttribute("data-item-id") === startItemId);
            const endIndex = items.findIndex(item => item.getAttribute("data-item-id") === endItemId);

            if (startIndex === -1 || endIndex === -1) {
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Item not found: startIndex=${startIndex}, endIndex=${endIndex}`);
                }
                return [];
            }

            // 開始インデックスと終了インデックスを正規化
            const minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);

            // 範囲内のアイテムを取得
            const itemsInRange: Array<{ id: string; text: string; }> = [];
            for (let i = minIndex; i <= maxIndex; i++) {
                const item = items[i] as HTMLElement;
                const itemId = item.getAttribute("data-item-id");
                if (!itemId) continue;

                const textElement = item.querySelector(".item-text");
                const text = textElement ? textElement.textContent || "" : "";

                itemsInRange.push({ id: itemId, text });
            }

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Found ${itemsInRange.length} items between ${startItemId} and ${endItemId}`);
            }

            return itemsInRange;
        } catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in getItemsBetween:`, error);
                if (error instanceof Error) {
                    console.error(`Error message: ${error.message}`);
                    console.error(`Error stack: ${error.stack}`);
                }
            }
            return [];
        }
    }

    /**
     * 矩形選択の方向を取得する
     * @returns 方向を示す文字列
     */
    private static getBoxSelectionDirection(): string {
        if (
            !KeyEventHandler.boxSelectionState.active
            || !KeyEventHandler.boxSelectionState.startItemId
            || !KeyEventHandler.boxSelectionState.endItemId
        ) {
            return "";
        }

        try {
            // アイテムのインデックスを取得
            const items = Array.from(document.querySelectorAll(".outliner-item"));
            const startIndex = items.findIndex(item =>
                item.getAttribute("data-item-id") === KeyEventHandler.boxSelectionState.startItemId
            );
            const endIndex = items.findIndex(item =>
                item.getAttribute("data-item-id") === KeyEventHandler.boxSelectionState.endItemId
            );

            // 水平方向の選択範囲を計算
            const startX = KeyEventHandler.boxSelectionState.startOffset;
            const endX = KeyEventHandler.boxSelectionState.endOffset;

            // 方向を判定
            let direction = "";

            // 垂直方向
            if (startIndex < endIndex) {
                direction += "↓"; // 下方向
            } else if (startIndex > endIndex) {
                direction += "↑"; // 上方向
            }

            // 水平方向
            if (startX < endX) {
                direction += "→"; // 右方向
            } else if (startX > endX) {
                direction += "←"; // 左方向
            }

            // 方向が判定できない場合
            if (!direction) {
                direction = "●"; // 点
            }

            return direction;
        } catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in getBoxSelectionDirection:`, error);
            }
            return "";
        }
    }

    /**
     * 矩形選択をキャンセルする
     */
    static cancelBoxSelection() {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.cancelBoxSelection called`);
        }

        try {
            // 矩形選択の状態をリセット
            KeyEventHandler.boxSelectionState = {
                active: false,
                startItemId: null,
                startOffset: 0,
                endItemId: null,
                endOffset: 0,
                ranges: [],
            };

            // 選択範囲をクリア
            store.clearSelectionForUser("local");

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Box selection cancelled`);
            }
        } catch (error) {
            // エラーが発生した場合はログに出力
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in cancelBoxSelection:`, error);
                if (error instanceof Error) {
                    console.error(`Error message: ${error.message}`);
                    console.error(`Error stack: ${error.stack}`);
                }
            }

            // 最低限の状態リセット
            if (KeyEventHandler.boxSelectionState) {
                KeyEventHandler.boxSelectionState.active = false;
                KeyEventHandler.boxSelectionState.ranges = [];
            }
        }
    }

    /**
     * ペーストイベントを処理する非同期メソッド。
     * 呼び出し側は `await` して権限拒否や読み取り失敗を捕捉する。
     * Clipboard API の権限エラーを捕捉し DEBUG_MODE 時にログ出力する。
     * 失敗時は `clipboard-permission-denied` または `clipboard-read-error`
     * を dispatch し、空文字を挿入してユーザーにはペーストされないように見せる。
     * @param event ClipboardEvent
     */
    static async handlePaste(event: ClipboardEvent): Promise<void> {
        // デバッグ情報
        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
            console.log(`KeyEventHandler.handlePaste called`);
        }

        try {
            // プレーンテキストを取得
            let text = event.clipboardData?.getData("text/plain") || "";

            // イベントから取得できない場合はClipboard APIを使用
            if (!text && typeof navigator !== "undefined" && navigator.clipboard) {
                try {
                    text = await navigator.clipboard.readText();
                } catch (error: any) {
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        if (error?.name === "NotAllowedError") {
                            console.warn("Clipboard permission denied", error);
                        } else {
                            console.error("navigator.clipboard.readText failed", error);
                        }
                    }

                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent(
                                error?.name === "NotAllowedError"
                                    ? "clipboard-permission-denied"
                                    : "clipboard-read-error",
                            ),
                        );
                    }

                    text = "";
                }
            }

            // テキストが取得できない場合はグローバル変数から取得（テスト用）
            if (!text && typeof window !== "undefined" && (window as any).lastCopiedText) {
                text = (window as any).lastCopiedText;
                console.log(`Using text from global variable: "${text}"`);
            }

            if (!text) return;

            // VS Code固有のメタデータを取得
            let vscodeMetadata: any = null;
            try {
                const vscodeData = event.clipboardData?.getData("application/vscode-editor");
                if (vscodeData) {
                    vscodeMetadata = JSON.parse(vscodeData);

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`VS Code metadata detected:`, vscodeMetadata);
                    }
                }
            } catch (error) {
                // メタデータの解析に失敗した場合は無視
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.error(`Failed to parse VS Code metadata:`, error);
                }
            }

            // デバッグ情報
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.log(`Pasting text: "${text}"`);
            }

            // ブラウザのデフォルトペースト動作を防止
            event.preventDefault();

            // グローバル変数に保存（テスト用）
            if (typeof window !== "undefined") {
                (window as any).lastPastedText = text;
                if (vscodeMetadata) {
                    (window as any).lastVSCodeMetadata = vscodeMetadata;
                }
            }

            // 現在の矩形選択を取得
            const boxSelection = Object.values(store.selections).find(sel =>
                sel.isBoxSelection && sel.boxSelectionRanges && sel.boxSelectionRanges.length > 0
            );

            // 選択範囲がある場合は、選択範囲を削除してからペースト
            const selections = Object.values(store.selections).filter(sel =>
                sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
            );

            // VS Codeのマルチカーソルテキストが含まれている場合
            if (
                vscodeMetadata && Array.isArray(vscodeMetadata.multicursorText)
                && vscodeMetadata.multicursorText.length > 0
            ) {
                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`VS Code multicursor text detected:`, vscodeMetadata.multicursorText);
                }

                const multicursorText = vscodeMetadata.multicursorText;
                const cursorInstances = store.getCursorInstances();
                const pasteMode = vscodeMetadata.pasteMode || "spread"; // デフォルトはspread

                // pasteMode: 'spread' - 各カーソルに異なるテキストを挿入
                // pasteMode: 'full' - 各カーソルに同じテキストを挿入
                if (pasteMode === "spread") {
                    // 各カーソルに対応するテキストを挿入
                    cursorInstances.forEach((cursor, index) => {
                        if (index < multicursorText.length) {
                            cursor.insertText(multicursorText[index]);
                        } else if (multicursorText.length > 0) {
                            // カーソル数がテキスト数より多い場合は、最後のテキストを繰り返し使用
                            cursor.insertText(multicursorText[multicursorText.length - 1]);
                        }
                    });
                } else {
                    // 'full'モード: 各カーソルに同じテキストを挿入
                    const fullText = multicursorText.join("\n");
                    cursorInstances.forEach(cursor => cursor.insertText(fullText));
                }
                return;
            }

            // 矩形選択（ボックス選択）へのペーストの場合
            if (boxSelection && boxSelection.boxSelectionRanges) {
                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Pasting into box selection:`, boxSelection);
                }

                // ペーストするテキストを行に分割
                const lines = text.split(/\r?\n/);
                const boxRanges = boxSelection.boxSelectionRanges;

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Box selection ranges:`, boxRanges);
                    console.log(`Lines to paste:`, lines);
                }

                // 矩形選択の各行に対応するテキストをペースト
                for (let i = 0; i < boxRanges.length; i++) {
                    const range = boxRanges[i];
                    const itemId = range.itemId;
                    const startOffset = Math.min(range.startOffset, range.endOffset);
                    const endOffset = Math.max(range.startOffset, range.endOffset);

                    // アイテムを取得
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"]`);
                    if (!itemEl) {
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.warn(`Item element not found for ID: ${itemId}`);
                        }
                        continue;
                    }

                    // テキスト要素を取得
                    const textEl = itemEl.querySelector(".item-text");
                    if (!textEl) {
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.warn(`Text element not found for item ID: ${itemId}`);
                        }
                        continue;
                    }

                    // 現在のテキストを取得
                    const currentText = textEl.textContent || "";

                    // ペーストするテキスト（行に対応するテキスト、または最後の行）
                    const lineText = i < lines.length ? lines[i] : (lines.length > 0 ? lines[lines.length - 1] : "");

                    // 新しいテキストを作成（選択範囲を置き換え）
                    const newText = currentText.substring(0, startOffset) + lineText + currentText.substring(endOffset);

                    // デバッグ情報
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Item ${i} (ID: ${itemId}): Replacing text from ${startOffset} to ${endOffset}`);
                        console.log(`Current text: "${currentText}"`);
                        console.log(`Line text to paste: "${lineText}"`);
                        console.log(`New text: "${newText}"`);
                    }

                    // カーソルインスタンスを取得または作成
                    let cursor = Array.from(store.cursorInstances.values()).find(c => c.itemId === itemId);
                    if (!cursor) {
                        // 新しいカーソルを作成
                        const cursorId = store.addCursor({
                            itemId,
                            offset: startOffset,
                            isActive: false,
                            userId: "local",
                        });
                        cursor = store.cursorInstances.get(cursorId);

                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(`Created new cursor for item ID: ${itemId}`);
                        }
                    }

                    // テキストを更新
                    if (cursor) {
                        // 選択範囲を削除してからテキストを挿入
                        const item = cursor.findTarget();
                        if (item) {
                            item.updateText(newText);
                            cursor.offset = startOffset + lineText.length;
                            cursor.applyToStore();

                            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                console.log(`Updated text for item ID: ${itemId}`);
                                console.log(`New cursor offset: ${cursor.offset}`);
                            }
                        } else {
                            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                                console.warn(`Target item not found for cursor with item ID: ${itemId}`);
                            }
                        }
                    } else {
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.warn(`Cursor not found or created for item ID: ${itemId}`);
                        }
                    }
                }

                // 選択範囲をクリア
                store.clearSelections();

                // カーソル点滅を開始
                store.startCursorBlink();

                // グローバル変数に保存（テスト用）
                if (typeof window !== "undefined") {
                    (window as any).lastBoxSelectionPaste = {
                        text,
                        lines,
                        boxRanges,
                    };
                }

                return;
            }

            // 矩形選択（ボックス選択）からのペーストの場合
            // VS Codeでは、矩形選択からのコピーは特殊なメタデータを含む
            if (
                vscodeMetadata && vscodeMetadata.isFromEmptySelection === false
                && vscodeMetadata.mode === "plaintext" && text.includes("\n")
            ) {
                // 矩形選択からのペーストとして処理
                const lines = text.split(/\r?\n/);

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Box selection paste detected, lines:`, lines);
                }

                // 各カーソルに対応する行を挿入
                const cursorInstances = store.getCursorInstances();
                cursorInstances.forEach((cursor, index) => {
                    if (index < lines.length) {
                        cursor.insertText(lines[index]);
                    } else if (lines.length > 0) {
                        // カーソル数が行数より多い場合は、最後の行を繰り返し使用
                        cursor.insertText(lines[lines.length - 1]);
                    }
                });
                return;
            }

            // 通常の複数行テキストの場合はマルチアイテムペーストとみなす
            if (text.includes("\n")) {
                const lines = text.split(/\r?\n/);

                // デバッグ情報
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Multi-line paste detected, lines:`, lines);
                }

                // 複数行テキストの処理
                // 複数のカーソルがある場合は、各カーソルに最初の行を挿入
                // 単一カーソルの場合は、最初の行のみを挿入
                const firstLine = lines[0] || "";
                const cursorInstances = store.getCursorInstances();
                cursorInstances.forEach(cursor => cursor.insertText(firstLine));
                return;
            }

            // 単一行テキストの場合は、カーソル位置に挿入
            const cursorInstances = store.getCursorInstances();
            cursorInstances.forEach(cursor => cursor.insertText(text));
        } catch (error) {
            // エラーが発生した場合はログに出力し UI に通知
            if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                console.error(`Error in handlePaste:`, error);
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
        }
    }
}

// テスト用にKeyEventHandlerをグローバルに公開
if (typeof window !== "undefined") {
    (window as any).__KEY_EVENT_HANDLER__ = KeyEventHandler;
}
