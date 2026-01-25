# Polling Analysis Report

Generated at: 2026-01-25T01:54:17.648Z

## Overview

- Total Polling Count: 140
- Necessary Polling: 2
- Suspicious Polling: 111
- Test-Only Polling: 27

## Suspicious Polling (Removal Candidates)

These pollings may be safe to remove.

### UserManager.ts:371:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 371
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    } catch (error) {
        // ... existing catch ...
        // If invalid-api-key happens here, catch it?
        // But I'm preventing it by checking isMockMode first.
        logger.error({ error }, "Failed to initialize auth listener");
        setTimeout(() => {
            this.initAuthListenerAsync();
        }, 1000);
    }
}
```

### AliasPicker.svelte:99:setTimeout

- **File**: `/app/client/src/components/AliasPicker.svelte`
- **Line**: 99
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
if (aliasPickerStore.isVisible) {
    try {
        // まずピッカー本体
        pickerElement?.focus();
        // 次に検索入力へ（存在すれば）
        setTimeout(() => {
            inputElement?.focus();
        }, 0);
        // 外部ストアへ選択インデックスを同期
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
    } catch {}
```

### Checklist.svelte:29:setInterval

- **File**: `/app/client/src/components/Checklist.svelte`
- **Line**: 29
- **Type**: setInterval
- **Code**: `const interval = setInterval(() => applyAutoReset(id), 1000);`

**Context**:

```
    const id = createChecklist(title, mode, rrule);
    const unsubscribe = checklists.subscribe(arr => {
        list = arr.find(l => l.id === id);
    });
    applyAutoReset(id);
    const interval = setInterval(() => applyAutoReset(id), 1000);
    return () => {
        unsubscribe();
        clearInterval(interval);
    };
});
```

### EditorOverlay.svelte:576:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 576
- **Type**: setTimeout
- **Code**: `updatePositionMapTimer = setTimeout(() => {`

**Context**:

```
let updatePositionMapTimer: number;

// 位置マップをdebounce付きで更新
function debouncedUpdatePositionMap() {
    clearTimeout(updatePositionMapTimer);
    updatePositionMapTimer = setTimeout(() => {
        if (!aliasPickerStore.isVisible) updatePositionMap();
    }, 100) as unknown as number;
}

// store からのデータ反映は MutationObserver と onMount 初期化で担保
```

### EditorOverlay.svelte:649:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 649
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        treeContainer.addEventListener('scroll', debouncedUpdatePositionMap);
    }


    // 初期状態でアクティブカーソルがある場合は、少し遅延してから点滅を開始
    setTimeout(() => {
        if (cursorList.some(cursor => cursor.isActive)) {
            store.startCursorBlink();
        }
    }, 200);
});
```

### EditorOverlay.svelte:1249:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 1249
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:

```
    } catch {
        // Intentionally empty - catch potential errors without further handling
    }
});
updatingFlags[key] = true; // デバッグ用の副作用（UIはこれに依存しない）
const timer = setTimeout(() => {
    mo?.disconnect();
    node.classList.remove('selection-box-updating');
    updatingFlags[key] = false;
    try {
        if (typeof window !== 'undefined' && (window as typeof window & { DEBUG_MODE?: boolean })?.DEBUG_MODE) {
```

### GlobalTextArea.svelte:60:requestAnimationFrame

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 60
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
    if (textareaRef) {
        textareaRef.focus();
        console.log("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

        // フォーカス確保のための追加試行
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                console.log("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
```

### GlobalTextArea.svelte:65:setTimeout

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 65
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                console.log("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
                    if (textareaRef) {
                        textareaRef.focus();
                        const isFocused = document.activeElement === textareaRef;
                        console.log("GlobalTextArea: Final focus set, focused:", isFocused);
                    }
```

### GlobalTextArea.svelte:397:setTimeout

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 397
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    if (aliasPickerStore.isVisible) {
        return;
    }
    if (activeItemId) {
        // フォーカスを確実に設定するための複数の試行
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
                textareaRef.focus();

                // デバッグ情報
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
```

### GraphView.svelte:239:setTimeout

- **File**: `/app/client/src/components/GraphView.svelte`
- **Line**: 239
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        });

        // ノードの位置が変更されたときにレイアウトを保存
        chart.on("finished", () => {
            // レイアウト計算完了後に少し待ってから保存
            setTimeout(() => {
                saveLayout();
            }, 100);
        });

        // ドラッグ終了時にも保存
```

### LoginStatusIndicator.svelte:118:setTimeout

- **File**: `/app/client/src/components/LoginStatusIndicator.svelte`
- **Line**: 118
- **Type**: setTimeout
- **Code**: `setTimeout(() => signOutBtn?.focus(), 0);`

**Context**:

```
function openMenu() {
    if (!isAuthenticated) return;
    isMenuOpen = true;
    updateMenuPosition();
    setTimeout(() => signOutBtn?.focus(), 0);
    attachGlobalHandlers();
}

function closeMenu() {
    isMenuOpen = false;
```

### OutlinerBase.svelte:317:setTimeout

- **File**: `/app/client/src/components/OutlinerBase.svelte`
- **Line**: 317
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            patchSingle(origAt(i));
        }
    } catch {}
};
patchItems();
setTimeout(() => {
    try {
        patchItems();
    } catch {}
}, 0);
setTimeout(() => {
```

### OutlinerBase.svelte:322:setTimeout

- **File**: `/app/client/src/components/OutlinerBase.svelte`
- **Line**: 322
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    setTimeout(() => {
        try {
            patchItems();
        } catch {}
    }, 0);
    setTimeout(() => {
        try {
            patchItems();
        } catch {}
    }, 200);
}
```

### OutlinerItem.svelte:762:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 762
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        "OutlinerItem startEditing: Focus set to global textarea, activeElement:",
        document.activeElement === textareaEl,
    );

    // フォーカス確保のための追加試行
    requestAnimationFrame(() => {
        textareaEl.focus();

        setTimeout(() => {
            textareaEl.focus();
```

### OutlinerItem.svelte:765:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 765
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    // フォーカス確保のための追加試行
    requestAnimationFrame(() => {
        textareaEl.focus();

        setTimeout(() => {
            textareaEl.focus();

        }, 10);
    });
    // テキスト内容を同期
```

### OutlinerItem.svelte:1032:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1032
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        if (textarea) {
            // フォーカスを確実に設定するための複数の試行
            textarea.focus();

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textarea.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textarea.focus();
```

### OutlinerItem.svelte:1036:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1036
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textarea.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textarea.focus();

                    // フォーカスが設定されたかチェック
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        // Intentionally empty: placeholder for debug logging
```

### OutlinerItemAlias.svelte:50:setInterval

- **File**: `/app/client/src/components/OutlinerItemAlias.svelte`
- **Line**: 50
- **Type**: setInterval
- **Code**: `const iv = setInterval(() => {`

**Context**:

```
// 暫定フォールバック: lastConfirmed をポーリング
let aliasLastConfirmedPulse: { itemId: string; targetId: string; at: number } | null = $state(null);

onMount(() => {
    const iv = setInterval(() => {
        try {
            const ap: any = (typeof window !== 'undefined') ? (window as any).aliasPickerStore : null;
            const li = ap?.lastConfirmedItemId;
            const lt = ap?.lastConfirmedTargetId;
            const la = ap?.lastConfirmedAt as number | null;
```

### OutlinerTree.svelte:66:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 66
- **Type**: requestAnimationFrame
- **Code**: `scrollTimeout = requestAnimationFrame(() => {`

**Context**:

```
    // Throttle scroll event to improve performance
    let scrollTimeout: number | null = null;
    function handleScroll() {
        if (!treeContainer || scrollTimeout) return;

        scrollTimeout = requestAnimationFrame(() => {
            if (treeContainer) {
                showScrollTop = treeContainer.scrollTop > 300;
            }
            scrollTimeout = null;
        });
```

### OutlinerTree.svelte:689:setTimeout

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 689
- **Type**: setTimeout
- **Code**: `setTimeout(focusNewItem, 10);`

**Context**:

```
                        `Sent finish-edit event to active item ${activeItem}`,
                    );
                }

                // 確実に処理の順序を保つため、少し遅延させてから新しいアイテムにフォーカス
                setTimeout(focusNewItem, 10);
            } else {
                // アクティブ要素が見つからない場合はすぐにフォーカス
                focusNewItem();
            }
        } else {
```

### ProjectSelector.svelte:159:setTimeout

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 159
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    "password",
                );
                logger.info("ProjectSelector - Login successful");

                // ログイン成功後、少し待ってからFirestoreの同期を確認
                setTimeout(() => {
                    const cnt = projectsFromUserProject(
                        firestoreStore.userProject,
                    ).length;
                    (logger as any).info(
                        { count: cnt },
```

### SearchBox.svelte:53:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 53
- **Type**: setTimeout
- **Code**: `const handler = setTimeout(() => {`

**Context**:

```
$effect(() => {
    if (!query) {
        debouncedQuery = "";
        return;
    }
    const handler = setTimeout(() => {
        debouncedQuery = query;
    }, 200);
    return () => clearTimeout(handler);
});
```

### SearchBox.svelte:419:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 419
- **Type**: setTimeout
- **Code**: `setTimeout(() => (refreshTick += 1), i * 50);`

**Context**:

```
            ) as HTMLElement | null;
            console.info(logPrefix, "main-toolbar styles", styles(toolbar));
        } catch {}
        // schedule a few ticks to help early reactivity with global generalStore
        for (let i = 0; i < 8; i++)
            setTimeout(() => (refreshTick += 1), i * 50);
    });
</script>

<div class="page-search-box">
    <label
```

### Toolbar.svelte:184:setTimeout

- **File**: `/app/client/src/components/Toolbar.svelte`
- **Line**: 184
- **Type**: setTimeout
- **Code**: `setTimeout(() => { dedupeToolbars(); dumpToolbarState("mount-setTimeout-0ms"); }, 0);`

**Context**:

```
onMount(() => {
    // Initial dedupe and dump
    dedupeToolbars();
    dumpToolbarState("mount");
    // After hydration/microtask
    setTimeout(() => { dedupeToolbars(); dumpToolbarState("mount-setTimeout-0ms"); }, 0);
});

if (typeof window !== "undefined") {
    import("$app/navigation").then(({ afterNavigate }) => {
        try {
```

### Toolbar.svelte:191:setTimeout

- **File**: `/app/client/src/components/Toolbar.svelte`
- **Line**: 191
- **Type**: setTimeout
- **Code**: `setTimeout(() => { dedupeToolbars(); dumpToolbarState("afterNavigate-0ms"); }, 0);`

**Context**:

```
if (typeof window !== "undefined") {
    import("$app/navigation").then(({ afterNavigate }) => {
        try {
            afterNavigate(() => {
                setTimeout(() => { dedupeToolbars(); dumpToolbarState("afterNavigate-0ms"); }, 0);
            });
        } catch {}
    }).catch(() => {});
}
</script>
```

### Cursor.ts:144:requestAnimationFrame

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 144
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (textarea) {
                // フォーカスを確実に設定するための複数の試行
                textarea.focus();

                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    textarea.focus();

                    // さらに確実にするためにsetTimeoutも併用
                    setTimeout(() => {
                        textarea.focus();
```

### Cursor.ts:148:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 148
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    textarea.focus();

                    // さらに確実にするためにsetTimeoutも併用
                    setTimeout(() => {
                        textarea.focus();

                        // デバッグ情報
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
```

### Cursor.ts:1171:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 1171
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### Cursor.ts:1425:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 1425
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // グローバルテキストエリアの選択範囲を設定
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### Cursor.ts:1448:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 1448
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### KeyEventHandler.ts:636:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 636
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### KeyEventHandler.ts:655:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 655
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
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
```

### KeyEventHandler.ts:704:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 704
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (globalTextarea) {
                // フォーカスを確実に設定するための複数の試行
                globalTextarea.focus();

                // requestAnimationFrameを使用してフォーカスを設定
                requestAnimationFrame(() => {
                    globalTextarea.focus();
                });
            }

            // 通常処理（cursor.onKeyDown等）後にAliasPickerを開く後追い処理
```

### KeyEventHandler.ts:712:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 712
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### KeyEventHandler.ts:729:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 729
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
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
```

### KeyEventHandler.ts:880:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 880
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        if (textareaElement) {
            // フォーカスを確実に設定するための複数の試行
            textareaElement.focus();

            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textareaElement.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textareaElement.focus();
```

### KeyEventHandler.ts:884:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 884
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            // requestAnimationFrameを使用してフォーカスを設定
            requestAnimationFrame(() => {
                textareaElement.focus();

                // さらに確実にするためにsetTimeoutも併用
                setTimeout(() => {
                    textareaElement.focus();

                    // デバッグ情報
                    if (
                        typeof window !== "undefined"
```

### KeyEventHandler.ts:1171:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1171
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### KeyEventHandler.ts:1305:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1305
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                        hintEl.style.transition = "opacity 0.3s ease-in-out";

                        document.body.appendChild(hintEl);

                        // 一定時間後にヒントをフェードアウト
                        setTimeout(() => {
                            hintEl.style.opacity = "0";
                            setTimeout(() => {
                                if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                            }, 300);
                        }, 1500);
```

### KeyEventHandler.ts:1307:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1307
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### CursorEditor.ts:600:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorEditor.ts`
- **Line**: 600
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            cursor.clearSelection();
            store.setActiveItem(cursor.itemId);
            store.startCursorBlink();

            if (typeof window !== "undefined") {
                setTimeout(() => {
                    const cursorVisible = document.querySelector(".editor-overlay .cursor") !== null;
                    if (!cursorVisible) {
                        cursor.applyToStore();
                        store.startCursorBlink();
                    }
```

### CursorSelection.ts:490:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 490
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### CursorSelection.ts:758:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 758
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // グローバルテキストエリアの選択範囲を設定
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // 選択範囲が正しく作成されたことを確認するために、DOMに反映されるまで少し待つ
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### CursorSelection.ts:781:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 781
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### linkPreviewHandler.ts:234:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 234
- **Type**: setTimeout
- **Code**: `previewTimer = window.setTimeout(() => {`

**Context**:

```
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }

    // 遅延してプレビューを表示（ユーザーが意図せずマウスオーバーした場合の表示を防ぐ）
    previewTimer = window.setTimeout(() => {
        // 既存のプレビューを削除
        if (currentPreview) {
            document.body.removeChild(currentPreview);
            currentPreview = null;
        }
```

### linkPreviewHandler.ts:286:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 286
- **Type**: setTimeout
- **Code**: `hideTimer = window.setTimeout(() => {`

**Context**:

```
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }

    // 遅延して非表示（ユーザーがプレビューに移動する時間を確保）
    hideTimer = window.setTimeout(() => {
        hidePreview();
    }, 200); // 200ms遅延
}

/**
```

### lock.ts:69:setTimeout

- **File**: `/app/client/src/lib/lock.ts`
- **Line**: 69
- **Type**: setTimeout
- **Code**: `//             await new Promise(r => setTimeout(r, 1000));`

**Context**:

```
//     }

//     async methodA() {
//         return this.lockManager.runExclusive('methodA', async () => {
//             console.log('methodA start');
//             await new Promise(r => setTimeout(r, 1000));
//             console.log('methodA end');
//         });
//     }

//     async methodB() {
```

### lock.ts:77:setTimeout

- **File**: `/app/client/src/lib/lock.ts`
- **Line**: 77
- **Type**: setTimeout
- **Code**: `//             await new Promise(r => setTimeout(r, 500));`

**Context**:

```
//     }

//     async methodB() {
//         return this.lockManager.runExclusive('methodB', async () => {
//             console.log('methodB start');
//             await new Promise(r => setTimeout(r, 500));
//             console.log('methodB end');
//         });
//     }

//     // 任意キーでもロック可能
```

### lock.ts:102:setTimeout

- **File**: `/app/client/src/lib/lock.ts`
- **Line**: 102
- **Type**: setTimeout
- **Code**: `//         await new Promise(r => setTimeout(r, 700));`

**Context**:

```
//     service.methodB();

//     // 任意のキーでのロック
//     service.runWithCustomLock('custom', async () => {
//         console.log('custom lock start');
//         await new Promise(r => setTimeout(r, 700));
//         console.log('custom lock end');
//     });
//     service.runWithCustomLock('custom', async () => {
//         console.log('custom lock 2 start');
//         await new Promise(r => setTimeout(r, 700));
```

### lock.ts:107:setTimeout

- **File**: `/app/client/src/lib/lock.ts`
- **Line**: 107
- **Type**: setTimeout
- **Code**: `//         await new Promise(r => setTimeout(r, 700));`

**Context**:

```
//         await new Promise(r => setTimeout(r, 700));
//         console.log('custom lock end');
//     });
//     service.runWithCustomLock('custom', async () => {
//         console.log('custom lock 2 start');
//         await new Promise(r => setTimeout(r, 700));
//         console.log('custom lock 2 end');
//     });
// })();
```

### metaDoc.test.ts:123:setTimeout

- **File**: `/app/client/src/lib/metaDoc.test.ts`
- **Line**: 123
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 10));`

**Context**:

```
            setContainerTitleInMetaDoc(containerId, "Version 1");
            updateLastOpenedAt(containerId);
            const firstTimestamp = getLastOpenedAt(containerId);

            // Wait a bit to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 10));
            setContainerTitleInMetaDoc(containerId, "Version 2");
            updateLastOpenedAt(containerId);
            const secondTimestamp = getLastOpenedAt(containerId);

            expect(getContainerTitleFromMetaDoc(containerId)).toBe("Version 2");
```

### pollingMonitor.ts:84:setInterval

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 84
- **Type**: setInterval
- **Code**: `console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);`

**Context**:

```
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                    // ダミーのIDを返す
                    return id;
                }

                const callbackFn: (...cbArgs: unknown[]) => unknown = typeof callback === "function"
```

### pollingMonitor.ts:127:setTimeout

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 127
- **Type**: setTimeout
- **Code**: `console.log(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);`

**Context**:

```
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    console.log(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);
                    return id;
                }

                const callbackFn: (...cbArgs: unknown[]) => unknown = typeof callback === "function"
                    ? (...cbArgs: unknown[]) => (callback as (...args: unknown[]) => unknown)(...cbArgs)
```

### pollingMonitor.ts:170:requestAnimationFrame

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 170
- **Type**: requestAnimationFrame
- **Code**: `console.log(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);`

**Context**:

```
            };

            this.calls.set(id, call);

            if (call.disabled) {
                console.log(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);
                return id;
            }

            const wrappedCallback = (time: number) => {
                call.executionCount++;
```

### connection.ts:255:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 255
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:

```
            if (solved) return;
            solved = true;
            resolve();
        };

        const timer = setTimeout(() => {
            console.log(
                `[connectPageDoc] Timeout waiting for sync (${syncTimeout}ms), proceeding anyway for room: ${room}`,
            );
            complete();
        }, syncTimeout);
```

### connection.ts:398:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 398
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:

```
// This ensures the pagesMap is populated with all seeded pages
await new Promise<void>((resolve) => {
    if (provider.isSynced) {
        resolve();
    } else {
        const timer = setTimeout(() => {
            console.log(
                `[createProjectConnection] Timeout waiting for project sync, proceeding anyway for room: ${room}`,
            );
            resolve();
        }, 15000);
```

### testHelpers.ts:61:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 61
- **Type**: setTimeout
- **Code**: `await new Promise((r) => setTimeout(r, pollIntervalMs));`

**Context**:

```
            if (debugEnabled) {
                console.log(`[${label}] provider.isSynced=true after ${i * pollIntervalMs}ms`);
            }
            break;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Step 2: Wait for actual data to be available
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) {
```

### testHelpers.ts:72:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 72
- **Type**: setTimeout
- **Code**: `await new Promise((r) => setTimeout(r, pollIntervalMs));`

**Context**:

```
            if (debugEnabled) {
                console.log(`[${label}] data available after ${i * pollIntervalMs}ms from synced`);
            }
            return true;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (debugEnabled) {
        console.log(
            `[${label}] timeout after ${timeoutMs}ms, isSynced=${provider.isSynced}, dataAvailable=${checkDataAvailable()}`,
```

### testHelpers.ts:203:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 203
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
        try {
            // HocuspocusProvider handles token refresh via its token option (function)
            // But we can force a reconnect/token send if needed.
            provider.disconnect();
            await new Promise(r => setTimeout(r, 100));
            await provider.connect();

            // Wait for reconnection
            let attempts = 0;
            while (!provider.isSynced && attempts < 50) {
```

### testHelpers.ts:209:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 209
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
            await provider.connect();

            // Wait for reconnection
            let attempts = 0;
            while (!provider.isSynced && attempts < 50) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            console.log(`[${pv}] reconnected, isSynced=${provider.isSynced}`);
        } catch (e) {
            console.error(`[${pv}] reconnect failed:`, e);
```

### yjsPersistence.test.ts:58:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 58
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        yText.insert(0, "Hello, World!");
        const yArray = doc1.getArray("items");
        yArray.push([1, 2, 3]);

        // Wait for persistence to save (y-indexeddb syncs asynchronously)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dispose the first doc
        persistence1.destroy();
        doc1.destroy();
```

### yjsPersistence.test.ts:94:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 94
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 30));`

**Context**:

```
        await waitForSync(persistence1);

        // Perform multiple insert operations
        const yText = doc1.getText("content");
        yText.insert(0, "First");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Second");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Third");
```

### yjsPersistence.test.ts:97:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 97
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 30));`

**Context**:

```
        const yText = doc1.getText("content");
        yText.insert(0, "First");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Second");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Third");
        await new Promise(resolve => setTimeout(resolve, 30));

        // Verify the text is correct before persistence
```

### yjsPersistence.test.ts:100:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 100
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 30));`

**Context**:

```
        yText.insert(yText.length, " Second");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Third");
        await new Promise(resolve => setTimeout(resolve, 30));

        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("First Second Third");

        // Wait for all updates to persist
```

### yjsPersistence.test.ts:106:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 106
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("First Second Third");

        // Wait for all updates to persist
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dispose and recreate
        persistence1.destroy();
        doc1.destroy();
```

### yjsPersistence.test.ts:172:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 172
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        const childArray = new Y.Array<string>();
        childArray.push(["item1", "item2"]);
        childMap.set("items", childArray);
        rootMap.set("child", childMap);

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
```

### yjsPersistence.test.ts:205:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 205
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 50));`

**Context**:

```
        await waitForSync(persistence1);

        // Create and then delete content
        const yText = doc1.getText("content");
        yText.insert(0, "Delete Me Please");
        await new Promise(resolve => setTimeout(resolve, 50));

        // Delete middle portion - remove "Me" (characters at positions 7-8)
        yText.delete(7, 2);

        await new Promise(resolve => setTimeout(resolve, 50));
```

### yjsPersistence.test.ts:210:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 210
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 50));`

**Context**:

```
        await new Promise(resolve => setTimeout(resolve, 50));

        // Delete middle portion - remove "Me" (characters at positions 7-8)
        yText.delete(7, 2);

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("Delete  Please");

        await new Promise(resolve => setTimeout(resolve, 100));
```

### yjsPersistence.test.ts:215:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 215
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("Delete  Please");

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
```

### +layout.svelte:130:setInterval

- **File**: `/app/client/src/routes/+layout.svelte`
- **Line**: 130
- **Type**: setInterval
- **Code**: `return setInterval(() => {`

**Context**:

```
 */
function schedulePeriodicLogRotation() {
    // 定期的なログローテーション（12時間ごと）
    const ROTATION_INTERVAL = 12 * 60 * 60 * 1000;

    return setInterval(() => {
        if (import.meta.env.DEV) {
            logger.info("定期的なログローテーションを実行します");
        }
        rotateLogFiles();
    }, ROTATION_INTERVAL);
```

### +page.svelte:80:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 80
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            return;
        }
        lastLoadKey = key;

        // 反応深度の問題を避けるため、イベントループに委ねる
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }

    // 認証成功時の処理
```

### +page.svelte:176:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 176
- **Type**: setTimeout
- **Code**: `await new Promise((r) => setTimeout(r, 100));`

**Context**:

```
    `loadProjectAndPage: Page "${pageName}" not found initially. Retrying...`,
);
// Wait up to 15 seconds (150 * 100ms) for Yjs to sync
const maxRetries = 150;
for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 100));
    targetPage = findPage();
    if (targetPage) {
        logger.info(
            `loadProjectAndPage: Found page "${pageName}" after retry ${i + 1}`,
        );
```

### +page.svelte:423:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 423
- **Type**: setTimeout
- **Code**: `await new Promise((resolve) => setTimeout(resolve, 100));`

**Context**:

```
            );
            let retryCount = 0;
            const maxRetries = 50; // 5秒間待機

            while (!currentUser && retryCount < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                currentUser = userManager.getCurrentUser();
                retryCount++;

                if (retryCount % 10 === 0) {
                    logger.info(
```

### +page.svelte:489:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 489
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            };
        }

        // ページ読み込み後にリンクプレビューハンドラーを設定
        // DOMが完全に読み込まれるのを待つ
        setTimeout(() => {
            setupLinkPreviewHandlers();
        }, 500);

        if (pageName) {
            searchHistoryStore.add(pageName);
```

### +page.svelte:110:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 110
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
        for (let i = 0; i < 50; i++) {
            if (store.project?.items?.length > 0) {
                console.log("Schedule page: store.project populated after", i * 100, "ms");
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        console.log("Schedule page: store.project?.items?.length =", store.project?.items?.length ?? 0);

        // Navigate back to schedule page
        const scheduleUrl = `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}/schedule`;
```

### +page.svelte:155:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 155
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
            break;
        }

        // Wait for yjsStore.yjsClient to be set (indicates main page loadProjectAndPage has completed)
        if (!yjsClientExists) {
            await new Promise(resolve => setTimeout(resolve, 100));
            parentLoadWaitAttempts++;
            continue;
        }

        // If project exists but has no items, try to trigger parent load
```

### +page.svelte:166:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 166
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        if (hasProject && !projectHasItems) {
            console.log("Schedule page: Project exists but has no items, triggering parent load");
            await triggerParentPageLoad();
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        parentLoadWaitAttempts++;
    }

    // After waiting, check store.project directly for debugging
    console.log("Schedule page: Final store state", {
```

### +page.svelte:338:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 338
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        if (foundPageRef) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        waitAttempts++;
    }
    console.log("Schedule page: After wait", {
        waitAttempts,
        hasFoundPage: !!foundPageRef,
```

### +page.svelte:428:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 428
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
                        console.log("Schedule page: Page subdocument connected with items", { pageId, itemCount });
                        break;
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
} catch (e) {
    console.warn("Schedule page: Error waiting for page connection:", e);
}
```

### +page.svelte:569:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 569
- **Type**: setTimeout
- **Code**: `setTimeout(() => URL.revokeObjectURL(url), 0);`

**Context**:

```
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    console.log("Schedule page: Exported schedules to iCal", filename);
}
catch (err) {
    console.error("Schedule page: Error exporting schedules:", err);
}
```

### +page.svelte:160:setInterval

- **File**: `/app/client/src/routes/debug/+page.svelte`
- **Line**: 160
- **Type**: setInterval
- **Code**: `statusInterval = setInterval(() => {`

**Context**:

```
        if (isAuthenticated) {
            initializeFluidClient();
        }

        // 接続状態を定期的に更新（5秒ごと）
        statusInterval = setInterval(() => {
            updateConnectionStatus();
        }, 5000);
    }
    catch (err) {
        console.error("Error initializing debug page:", err);
```

### +page.svelte:77:setTimeout

- **File**: `/app/client/src/routes/projects/containers/+page.svelte`
- **Line**: 77
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        yjsStore.yjsClient = newClient as any;

        success = `新しいアウトライナーが作成されました！ (ID: ${createdContainerId})`;

        // 1.5秒後に作成したプロジェクトのページに移動
        setTimeout(() => {
            goto("/" + containerName);
        }, 1500);
    }
    catch (err) {
        logger.error("新規アウトライナー作成エラー:", err);
```

### +page.svelte:76:setTimeout

- **File**: `/app/client/src/routes/projects/delete/+page.svelte`
- **Line**: 76
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        }

        if (!error && deletedCount > 0) {
            success = "選択したプロジェクトを削除しました";
            // 削除後にプロジェクトリストを更新するため、少し待ってからページをリロード
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }

        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reassignment to trigger Svelte reactivity, not creating new reactive state
```

### yjs-schema.ts:394:setTimeout

- **File**: `/app/client/src/schema/yjs-schema.ts`
- **Line**: 394
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
// Wait for items to be available if subdoc just loaded
let waitCount = 0;
const maxWait = 100; // Increase to 10s for slow CI environments
while (pageItemsSize <= 1 && waitCount < maxWait) { // <= 1 means only "initialized" key
    await new Promise(resolve => setTimeout(resolve, 100));
    const newSize = pageItems.size;
    if (newSize === pageItemsSize) {
        // Size hasn't changed, no more items to wait for
        break;
    }
```

### CommandPaletteStore.svelte.ts:427:setTimeout

- **File**: `/app/client/src/stores/CommandPaletteStore.svelte.ts`
- **Line**: 427
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
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
```

### EditorOverlayStore.svelte.ts:225:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 225
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    textarea.focus();

                    // Use setTimeout as well to be more certain
                    setTimeout(() => {
                        textarea.focus();
```

### EditorOverlayStore.svelte.ts:229:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 229
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    textarea.focus();

                    // Use setTimeout as well to be more certain
                    setTimeout(() => {
                        textarea.focus();

                        // Debug info
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
```

### EditorOverlayStore.svelte.ts:278:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 278
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        if (textarea) {
            // Multiple attempts to ensure focus is set
            textarea.focus();

            // Set focus using requestAnimationFrame
            requestAnimationFrame(() => {
                textarea.focus();

                // Use setTimeout as well to be more certain
                setTimeout(() => {
                    textarea.focus();
```

### EditorOverlayStore.svelte.ts:282:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 282
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            // Set focus using requestAnimationFrame
            requestAnimationFrame(() => {
                textarea.focus();

                // Use setTimeout as well to be more certain
                setTimeout(() => {
                    textarea.focus();

                    // Debug info
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
```

### EditorOverlayStore.svelte.ts:428:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 428
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            console.log(`Box selection set with key: ${key}`);
            console.log(`Current selections:`, this.selections);
        }

        // Set isUpdating to false after 300ms
        setTimeout(() => {
            const currentSelection = this.selections[key];
            if (currentSelection && currentSelection.isUpdating) {
                // Create a new object and replace it so that Svelte can detect the change
                this.selections = {
                    ...this.selections,
```

### EditorOverlayStore.svelte.ts:539:setInterval

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 539
- **Type**: setInterval
- **Code**: `this.timerId = setInterval(() => {`

**Context**:

```
    startCursorBlink() {
        this.cursorVisible = true;
        clearInterval(this.timerId);
        // Simply toggle so it works in Node too
        this.timerId = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
        }, 530);
    }

    stopCursorBlink() {
```

### EditorOverlayStore.svelte.ts:695:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 695
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Force update by temporarily clearing and resetting the selection range
        const tempSelections = { ...this.selections };
        this.selections = {};

        // Reset after a short wait
        setTimeout(() => {
            this.selections = tempSelections;
        }, 0);

        // Update cursors as well
        const tempCursors = { ...this.cursors };
```

### EditorOverlayStore.svelte.ts:703:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 703
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Update cursors as well
        const tempCursors = { ...this.cursors };
        this.cursors = {};

        setTimeout(() => {
            this.cursors = tempCursors;
        }, 0);
    }

    /**
```

### EditorOverlayStore.test.ts:66:setInterval

- **File**: `/app/client/src/stores/EditorOverlayStore.test.ts`
- **Line**: 66
- **Type**: setInterval
- **Code**: `this.timerId = setInterval(() => {`

**Context**:

```
    );
}
startCursorBlink() {
    this.cursorVisible = true;
    clearInterval(this.timerId);
    this.timerId = setInterval(() => {
        this.cursorVisible = !this.cursorVisible;
    }, 530);
}
stopCursorBlink() {
    clearInterval(this.timerId);
```

### snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts:51:setTimeout

- **File**: `/app/client/src/tests/integration/snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts`
- **Line**: 51
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
        // 差分領域にHTMLが描画されていること
        const diff = document.querySelector(".diff-view") as HTMLElement;
        expect(diff).toBeTruthy();

        // Wait for reactivity
        await new Promise(r => setTimeout(r, 100));

        expect(diff.innerHTML).toContain("ins");
    });
});
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:20:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 20
- **Type**: setTimeout
- **Code**: `else setTimeout(checkSync, 50);`

**Context**:

```
const checkSync = () => {
    if (c1.provider.isSynced && c2.provider.isSynced) {
        syncedCount++;
        // Check twice to ensure stable sync state
        if (syncedCount >= 2) resolve(undefined);
        else setTimeout(checkSync, 50);
    } else {
        setTimeout(checkSync, 50);
    }
};
checkSync();
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:22:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 22
- **Type**: setTimeout
- **Code**: `setTimeout(checkSync, 50);`

**Context**:

```
            syncedCount++;
            // Check twice to ensure stable sync state
            if (syncedCount >= 2) resolve(undefined);
            else setTimeout(checkSync, 50);
        } else {
            setTimeout(checkSync, 50);
        }
    };
    checkSync();
});
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:36:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 36
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
// Wait for the page to be synchronized to the second client's project document
const project2 = Project.fromDoc(c2.doc);
await new Promise<void>((resolve) => {
    let resolved = false;
    // Set timeout for resolution
    setTimeout(() => {
        if (!resolved) {
            console.log("Timeout waiting for project synchronization");
            resolve();
        }
    }, 5000);
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:63:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 63
- **Type**: setTimeout
- **Code**: `setTimeout(check, 50);`

**Context**:

```
        resolved = true;
        resolve();
        return;
    }
    // Continue checking every 50ms
    setTimeout(check, 50);
} catch (e) {
    console.log("Error checking synchronization:", e);
    // Continue checking
    setTimeout(check, 50);
}
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:67:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 67
- **Type**: setTimeout
- **Code**: `setTimeout(check, 50);`

**Context**:

```
            // Continue checking every 50ms
            setTimeout(check, 50);
        } catch (e) {
            console.log("Error checking synchronization:", e);
            // Continue checking
            setTimeout(check, 50);
        }
    };
    check();
});
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:83:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 83
- **Type**: setTimeout
- **Code**: `setTimeout(check, 50);`

**Context**:

```
    const conn = c1.getPageConnection(page.id);
    if (conn) {
        resolved = true;
        resolve(conn);
    } else if (!resolved) {
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:86:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 86
- **Type**: setTimeout
- **Code**: `setTimeout(check, 0);`

**Context**:

```
        resolve(conn);
    } else if (!resolved) {
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
    if (!resolved) {
        console.log("Timeout waiting for page connection on client 1");
        resolve(null);
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:88:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 88
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
    if (!resolved) {
        console.log("Timeout waiting for page connection on client 1");
        resolve(null);
    }
}, 30000);
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:104:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 104
- **Type**: setTimeout
- **Code**: `setTimeout(check, 50);`

**Context**:

```
    const conn = c2.getPageConnection(page.id);
    if (conn) {
        resolved = true;
        resolve(conn);
    } else if (!resolved) {
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:107:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 107
- **Type**: setTimeout
- **Code**: `setTimeout(check, 0);`

**Context**:

```
        resolve(conn);
    } else if (!resolved) {
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
    if (!resolved) {
        console.log("Timeout waiting for page connection on client 2");
        resolve(null);
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:109:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 109
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        setTimeout(check, 50);
    }
};
setTimeout(check, 0);
// Set timeout for resolution
setTimeout(() => {
    if (!resolved) {
        console.log("Timeout waiting for page connection on client 2");
        resolve(null);
    }
}, 30000);
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:157:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 157
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
                }
            }
        }

        // Wait for the manual sync to take effect
        await new Promise(r => setTimeout(r, 100));

        const states = p1c2.awareness!.getStates() as Map<number, AwarenessState>;
        console.log("States size:", states.size);
        console.log("States values:", Array.from(states.values()));
        const received = Array.from(states.values()).some(s => (s as any).presence?.cursor?.itemId === "root");
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:169:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 169
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 0));`

**Context**:

```
        expect(received).toBe(true);
        p1c1.dispose();
        p1c2.dispose();
        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
```

### ypp-page-subdoc-provider-c83a5f4b.integration.spec.ts:40:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/ypp-page-subdoc-provider-c83a5f4b.integration.spec.ts`
- **Line**: 40
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 50));`

**Context**:

```
): Promise<PageConnection> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const pageConn = conn.getPageConnection(pageId);
        if (pageConn) return pageConn;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timeout waiting for page connection: ${pageId}`);
}

describe("page subdoc provider", () => {
```

### yjs-persistence.spec.ts:107:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/yjs-persistence.spec.ts`
- **Line**: 107
- **Type**: setTimeout
- **Code**: `setTimeout(callback, 10);`

**Context**:

```
        it("should wait for sync event if not synced", async () => {
            const persistence: MockPersistence = {
                synced: false,
                once: vi.fn((event: string, callback: () => void) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
                destroy: vi.fn(),
            };

            await expect(waitForSync(persistence)).resolves.toBeUndefined();
```

### yjs-persistence.spec.ts:121:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/yjs-persistence.spec.ts`
- **Line**: 121
- **Type**: setTimeout
- **Code**: `setTimeout(callback, 10);`

**Context**:

```
        it("should handle multiple calls to waitForSync", async () => {
            const persistence: MockPersistence = {
                synced: false,
                once: vi.fn((event: string, callback: () => void) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
                destroy: vi.fn(),
            };

            const waitPromise1 = waitForSync(persistence);
```

## Test-Only Polling

These are pollings executed only in test environments.

### UserManager.ts:333:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 333
- **Type**: setTimeout

### AuthComponent.svelte:71:setTimeout

- **File**: `/app/client/src/components/AuthComponent.svelte`
- **Line**: 71
- **Type**: setTimeout

### CommentThread.svelte:186:setInterval

- **File**: `/app/client/src/components/CommentThread.svelte`
- **Line**: 186
- **Type**: setInterval

### EditorOverlay.svelte:232:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 232
- **Type**: setTimeout

### EditorOverlay.svelte:266:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 266
- **Type**: setTimeout

### OutlinerTree.svelte:131:setInterval

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 131
- **Type**: setInterval

### ProjectSelector.svelte:70:setInterval

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 70
- **Type**: setInterval

### SearchPanel.svelte:43:setInterval

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 43
- **Type**: setInterval

### SearchPanel.svelte:399:requestAnimationFrame

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 399
- **Type**: requestAnimationFrame

### connection.ts:149:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 149
- **Type**: setTimeout

### connection.ts:282:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 282
- **Type**: setTimeout

### yjsPersistence.test.ts:137:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 137
- **Type**: setTimeout

### yjsPersistence.test.ts:246:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 246
- **Type**: setTimeout

### yjsPersistence.test.ts:270:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 270
- **Type**: setTimeout

### +page.svelte:275:setInterval

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 275
- **Type**: setInterval

### +page.svelte:470:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 470
- **Type**: setTimeout

### +page.svelte:470:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 470
- **Type**: setTimeout

### +page.svelte:234:setTimeout

- **File**: `/app/client/src/routes/[project]/settings/+page.svelte`
- **Line**: 234
- **Type**: setTimeout

### +page.svelte:81:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 81
- **Type**: setTimeout

### +page.svelte:95:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 95
- **Type**: setTimeout

### +page.svelte:143:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 143
- **Type**: setTimeout

### +page.svelte:157:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 157
- **Type**: setTimeout

### AliasPickerStore.svelte.ts:52:setTimeout

- **File**: `/app/client/src/stores/AliasPickerStore.svelte.ts`
- **Line**: 52
- **Type**: setTimeout

### CommandPaletteStore.svelte.ts:422:requestAnimationFrame

- **File**: `/app/client/src/stores/CommandPaletteStore.svelte.ts`
- **Line**: 422
- **Type**: requestAnimationFrame

### itm-add-new-items-with-enter-49d26e99.integration.spec.ts:18:setTimeout

- **File**: `/app/client/src/tests/integration/itm-add-new-items-with-enter-49d26e99.integration.spec.ts`
- **Line**: 18
- **Type**: setTimeout

### setup.ts:45:setTimeout

- **File**: `/app/client/src/tests/integration/setup.ts`
- **Line**: 45
- **Type**: setTimeout

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:134:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 134
- **Type**: setTimeout

## Necessary Polling

These are pollings with clear purposes and should not be removed.

### EditorOverlayStore.svelte.ts:830:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 830
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => textarea.focus());`

### EditorOverlayStore.svelte.ts:831:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 831
- **Type**: setTimeout
- **Code**: `setTimeout(() => textarea.focus(), 10);`
