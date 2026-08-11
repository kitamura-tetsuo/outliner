# Polling Analysis Report

Generated at: 2026-08-11T13:30:48.209Z

## Overview

- Total Polling Count: 135
- Necessary Polling: 0
- Suspicious Polling: 106
- Test-Only Polling: 29

## Suspicious Polling (Removal Candidates)

These pollings may be safe to remove.

### UserManager.ts:379:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 379
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    } catch (error) {
        // ... existing catch ...
        // If invalid-api-key happens here, catch it?
        // But I'm preventing it by checking isMockMode first.
        logger.error({ error: error as Error }, "Failed to initialize auth listener");
        setTimeout(() => {
            this.initAuthListenerAsync();
        }, 1000);
    }
}
```

### BacklinkPanel.svelte:35:setTimeout

- **File**: `/app/client/src/components/BacklinkPanel.svelte`
- **Line**: 35
- **Type**: setTimeout
- **Code**: `const handler = setTimeout(() => {`

**Context**:

```
});

let debouncedPagesVersion = $state(0);
$effect(() => {
    const v = store.pagesVersion;
    const handler = setTimeout(() => {
        debouncedPagesVersion = v;
    }, 500);
    return () => clearTimeout(handler);
});
```

### Checklist.svelte:59:setTimeout

- **File**: `/app/client/src/components/Checklist.svelte`
- **Line**: 59
- **Type**: setTimeout
- **Code**: `timerId = setTimeout(() => {`

**Context**:

```
    const delay = getNextResetDelay(listId);
    if (delay === null) return;

    const safeDelay = Math.min(delay, 24 * 60 * 60 * 1000);
    timerId = setTimeout(() => {
        applyAutoReset(listId);
        setupTimer();
    }, safeDelay);
}
```

### EditorOverlay.svelte:749:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 749
- **Type**: setTimeout
- **Code**: `updatePositionMapTimer = setTimeout(() => {`

**Context**:

```
let updatePositionMapTimer: ReturnType<typeof setTimeout>;

// Update position map with debounce
function debouncedUpdatePositionMap() {
    clearTimeout(updatePositionMapTimer);
    updatePositionMapTimer = setTimeout(() => {
        if (!aliasPickerStore.isVisible) {
            updatePositionMap();
            updateTextareaPosition();
        }
    }, 100);
```

### EditorOverlay.svelte:838:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 838
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        window.visualViewport.addEventListener("scroll", handleVisualViewportScroll);
    }


    // If there is an active cursor in the initial state, start blinking after a short delay
    setTimeout(() => {
        if (cursorList.some(cursor => cursor.isActive)) {
            store.startCursorBlink();
        }
    }, 200);
});
```

### EditorOverlay.svelte:1487:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 1487
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:

```
    } catch {
        // Intentionally empty - catch potential errors without further handling
    }
});
updatingFlags[key] = true; // Side effect for debugging (UI does not depend on this)
const timer = setTimeout(() => {
    mo?.disconnect();
    node.classList.remove('selection-box-updating');
    updatingFlags[key] = false;
    try {
        if (typeof window !== 'undefined' && window.DEBUG_MODE) {
```

### GlobalTextArea.svelte:40:requestAnimationFrame

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 40
- **Type**: requestAnimationFrame
- **Code**: `selectionSyncRafId = requestAnimationFrame(() => {`

**Context**:

```
    if (store.suppressSelectionResync) return;

    if (selectionSyncRafId !== null) {
        cancelAnimationFrame(selectionSyncRafId);
    }
    selectionSyncRafId = requestAnimationFrame(() => {
        selectionSyncRafId = null;
        store.syncSelectionFromTextarea();
    });
}
```

### GlobalTextArea.svelte:223:setTimeout

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 223
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        }
    }

    if (activeItemId) {
        // Multiple attempts to ensure focus is set
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
                // Double check current active element is not an interactive input/button
                const activeEl = document.activeElement;
                if (activeEl && !keepsEditorFocus(activeEl)) {
                    const activeTag = activeEl.tagName.toLowerCase();
```

### GraphView.svelte:226:setTimeout

- **File**: `/app/client/src/components/GraphView.svelte`
- **Line**: 226
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    },
                },
            ],
        });

        setTimeout(() => {
            if (graphDiv) {
                const canvas = graphDiv.querySelector("canvas");
                if (canvas) {
                    canvas.setAttribute("role", "img");
                    canvas.setAttribute(
```

### GraphView.svelte:274:setTimeout

- **File**: `/app/client/src/components/GraphView.svelte`
- **Line**: 274
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        });

        // Save layout when node positions change
        chart.on("finished", () => {
            // Wait a bit after layout calculation completes before saving
            setTimeout(() => {
                saveLayout();
            }, 100);
        });

        // Also save on drag end
```

### OutlinerBase.svelte:63:setTimeout

- **File**: `/app/client/src/components/OutlinerBase.svelte`
- **Line**: 63
- **Type**: setTimeout
- **Code**: `resetTimeout = setTimeout(updateResetting, 60000 - (now - resetStartedAt));`

**Context**:

```
            const now = Date.now();
            clearTimeout(resetTimeout);

            if (isResetting && resetStartedAt && now - resetStartedAt < 60000) {
                isServerResetting = true;
                resetTimeout = setTimeout(updateResetting, 60000 - (now - resetStartedAt));
            } else {
                isServerResetting = false;
            }
        };
        updateResetting();
```

### OutlinerItem.svelte:139:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 139
- **Type**: setTimeout
- **Code**: `setTimeout(() => { renameError = null; }, 3000);`

**Context**:

```
const onRenameError = (e: Event) => {
    const ce = e as CustomEvent;
    if (ce.detail?.itemId === model.id) {
        renameError = ce.detail.message;
        setTimeout(() => { renameError = null; }, 3000);
    }
};
window.addEventListener("page-rename-error", onRenameError);
return () => {
    window.removeEventListener("page-rename-error", onRenameError);
```

### OutlinerItem.svelte:816:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 816
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
    // Set focus to global textarea (highest priority)
    textareaEl.focus();
    logger.debug(undefined, "OutlinerItem startEditing: Focus set to global textarea, activeElement: " + (document.activeElement === textareaEl));

    // Additional attempts to ensure focus
    requestAnimationFrame(() => {
        textareaEl.focus();
    });
    // Synchronize text content
    textareaEl.value = textString;
    textareaEl.focus();
```

### OutlinerItem.svelte:1195:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1195
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            model.original.updateText(newText);

            // Handle parent updates
            const parentKey = safeGetNodeParent(model.original.tree, model.original.key);
            if (parentKey && parentKey !== "root") {
                setTimeout(() => {
                    try {
                        const ydoc = model.original.ydoc;
                        const tree = model.original.tree;
                        if (ydoc && tree) {
                            // Require app-schema dynamically to avoid circular dep issues in store or import Item from app-schema
```

### OutlinerItem.svelte:1296:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1296
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        if (textarea) {
            // Multiple attempts to ensure focus is set
            textarea.focus();

            // requestAnimationFrame
            requestAnimationFrame(() => {
                textarea.focus();
            });
        }
        else {
            logger.warn({ error: new Error("Global textarea not found") }, "Global textarea not found");
```

### OutlinerItemContextMenu.svelte:34:setTimeout

- **File**: `/app/client/src/components/OutlinerItemContextMenu.svelte`
- **Line**: 34
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                y = window.innerHeight - rect.height - 10;
            }
        }

        // Focus the first item on mount
        setTimeout(() => {
            const firstButton = menuRef?.querySelector("button");
            if (firstButton) firstButton.focus();
        }, 0);
    });
```

### OutlinerTree.svelte:142:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 142
- **Type**: requestAnimationFrame
- **Code**: `scrollTimeout = requestAnimationFrame(() => {`

**Context**:

```
    // Throttle scroll event to improve performance
    let scrollTimeout: ReturnType<typeof requestAnimationFrame> | null = null;
    function handleScroll() {
        if (scrollTimeout) return;

        scrollTimeout = requestAnimationFrame(() => {
            if (typeof window !== "undefined") {
                showScrollTop = window.scrollY > 300;
            }
            scrollTimeout = null;
        });
```

### ProjectSelector.svelte:115:setTimeout

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 115
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    "password",
                );
                logger.info({}, "ProjectSelector - Login successful");

                // After successful login, wait a bit and check Firestore sync
                setTimeout(() => {
                    const cnt = projectsFromUserProject(
                        firestoreStore.userProject,
                    ).length;
                    logger.info(
                        { count: cnt },
```

### SearchBox.svelte:46:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 46
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

### SearchBox.svelte:311:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 311
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    if (e.target && "value" in e.target && e.target.value !== query) {
        query = e.target.value as string;
    }
}}
onblur={() => {
    setTimeout(() => {
        isFocused = false;
    }, 200);
}}
oninput={() => {
    shouldRefocus = true;
```

### CalendarView.svelte:272:setTimeout

- **File**: `/app/client/src/components/calendar/CalendarView.svelte`
- **Line**: 272
- **Type**: setTimeout
- **Code**: `requeryTimer = setTimeout(() => {`

**Context**:

```
    }
}

function scheduleRequery() {
    if (requeryTimer !== undefined) clearTimeout(requeryTimer);
    requeryTimer = setTimeout(() => {
        requeryTimer = undefined;
        void runQuery();
    }, REQUERY_DEBOUNCE_MS);
}
```

### Cursor.ts:249:requestAnimationFrame

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 249
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame and tick
                requestAnimationFrame(() => {
                    textarea.focus();

                    tick().then(() => {
                        textarea.focus();
```

### Cursor.ts:689:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 689
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined" && hasSelection) {
            tick().then(() => {
                setTimeout(() => {
                    if (typeof document === "undefined") return;
                    const selectionElements = document.querySelectorAll(".editor-overlay .selection");

                    // Reset selection if not displayed
                    if (selectionElements.length === 0) {
```

### KeyEventHandler.ts:345:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 345
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            const localSelection = Object.values(store.selections).find(s => (s.userId || "local") === "local");
            if (!localSelection) return;

            // Give the browser native copy a chance to fire.
            // If it hasn't fired in the same loop, we fire a synthetic one
            setTimeout(() => {
                if (KeyEventHandler._nativeCopyFired) return;
                const structured = selectedItemsClipboardData();
                // A component host contributes its view name to the structured
                // payload only, so the structured plain text is authoritative
                // whenever the selection carries one.
```

### KeyEventHandler.ts:944:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 944
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
// Since Enter's normal processing (newline/new item addition etc.) should be complete here,
// open AliasPicker afterwards based on pre-detection flag
if (shouldOpenAliasPickerAfterDefault) {
    try {
        setTimeout(() => {
            try {
                const w: unknown = typeof window !== "undefined"
                    ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                    : null;
                const tryOpen = (attempt = 0) => {
```

### KeyEventHandler.ts:970:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 970
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
        logger.error(_e);
    }
    return;
}
if (attempt < 10) {
    setTimeout(() => tryOpen(attempt + 1), 10);
} else {
    logger.warn(
        "KeyEventHandler(Post): active item not found to open AliasPicker",
    );
}
```

### KeyEventHandler.ts:1033:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1033
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (globalTextarea) {
                // Multiple attempts to ensure focus is set
                globalTextarea.focus();

                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    globalTextarea.focus();
                });
            }

            // Post-processing to open AliasPicker after normal processing (cursor.onKeyDown etc.)
```

### KeyEventHandler.ts:1041:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1041
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            }

            // Post-processing to open AliasPicker after normal processing (cursor.onKeyDown etc.)
            if (shouldOpenAliasPickerAfterDefault) {
                try {
                    setTimeout(() => {
                        try {
                            const w: unknown = typeof window !== "undefined"
                                ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                                : null;
                            const tryOpen = (attempt = 0) => {
```

### KeyEventHandler.ts:1065:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1065
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
        logger.error(_e);
    }
    return;
}
if (attempt < 10) {
    setTimeout(() => tryOpen(attempt + 1), 10);
} else {
    logger.warn(
        "KeyEventHandler(Post2): active item not found to open AliasPicker",
    );
}
```

### KeyEventHandler.ts:1296:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1296
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
        if (textareaElement) {
            // Multiple attempts to ensure focus is set
            textareaElement.focus();

            // Set focus using requestAnimationFrame
            requestAnimationFrame(() => {
                textareaElement.focus();

                // Also use setTimeout to be more certain
                setTimeout(() => {
                    textareaElement.focus();
```

### KeyEventHandler.ts:1300:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1300
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            // Set focus using requestAnimationFrame
            requestAnimationFrame(() => {
                textareaElement.focus();

                // Also use setTimeout to be more certain
                setTimeout(() => {
                    textareaElement.focus();

                    // Debug info
                    if (
                        typeof window !== "undefined"
```

### KeyEventHandler.ts:1703:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1703
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    }
                `;
                document.head.appendChild(styleEl);

                // Remove style after a certain time
                setTimeout(() => {
                    if (typeof document !== "undefined") {
                        const el = document.getElementById("box-selection-feedback");
                        if (el) el.remove();
                    }
                }, 500);
```

### KeyEventHandler.ts:1862:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1862
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                        hintEl.style.transition = "opacity 0.3s ease-in-out";

                        document.body.appendChild(hintEl);

                        // Fade out hint after a certain time
                        setTimeout(() => {
                            hintEl.style.opacity = "0";
                            setTimeout(() => {
                                if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                            }, 300);
                        }, 1500);
```

### KeyEventHandler.ts:1864:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1864
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                        document.body.appendChild(hintEl);

                        // Fade out hint after a certain time
                        setTimeout(() => {
                            hintEl.style.opacity = "0";
                            setTimeout(() => {
                                if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                            }, 300);
                        }, 1500);
                    }
                }
```

### CursorEditor.ts:1082:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorEditor.ts`
- **Line**: 1082
- **Type**: setTimeout
- **Code**: `this.cursorVisibilityRecoveryTimeoutId = setTimeout(() => {`

**Context**:

```
if (typeof window !== "undefined") {
    if (this.cursorVisibilityRecoveryTimeoutId !== undefined) {
        clearTimeout(this.cursorVisibilityRecoveryTimeoutId);
    }
    this.cursorVisibilityRecoveryTimeoutId = setTimeout(() => {
        this.cursorVisibilityRecoveryTimeoutId = undefined;
        const cursorVisible = document.querySelector(".editor-overlay .cursor") !== null;
        if (!cursorVisible) {
            cursor.applyToStore();
            store.startCursorBlink();
```

### CursorSelection.ts:498:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 498
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Set global textarea selection
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### CursorSelection.ts:774:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 774
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Set global textarea selection
        this.cursor.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined") {
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Selection elements in DOM: ${selectionElements.length}`);
                }
```

### CursorSelection.ts:797:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 797
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    store.forceUpdate();
                }
            }, 100); // Increase timeout to 100ms to wait longer for DOM updates

            // Additional check and update
            setTimeout(() => {
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");
                if (selectionElements.length === 0) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(`Selection still not visible after 100ms, forcing update again`);
                    }
```

### demoInit.ts:81:setTimeout

- **File**: `/app/client/src/lib/demoInit.ts`
- **Line**: 81
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => resolve(undefined), ms);`

**Context**:

```
    return { client, project };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
```

### linkPreviewHandler.ts:239:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 239
- **Type**: setTimeout
- **Code**: `previewTimer = window.setTimeout(() => {`

**Context**:

```
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }

    // Show preview with delay (prevent display when user accidentally hovers)
    previewTimer = window.setTimeout(() => {
        // Remove existing preview
        if (currentPreview) {
            document.body.removeChild(currentPreview);
            currentPreview = null;
        }
```

### linkPreviewHandler.ts:291:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 291
- **Type**: setTimeout
- **Code**: `hideTimer = window.setTimeout(() => {`

**Context**:

```
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }

    // Hide with delay (allow time for user to move to preview)
    hideTimer = window.setTimeout(() => {
        hidePreview();
    }, 200); // 200ms delay
}

/**
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

### pollingMonitor.ts:86:setInterval

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 86
- **Type**: setInterval
- **Code**: `logger.debug(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);`

**Context**:

```
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    logger.debug(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                    // Return a dummy ID
                    return id;
                }

                const callbackFn: (...cbArgs: unknown[]) => unknown = typeof callback === "function"
```

### pollingMonitor.ts:129:setTimeout

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 129
- **Type**: setTimeout
- **Code**: `logger.debug(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);`

**Context**:

```
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    logger.debug(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);
                    return id;
                }

                const callbackFn: (...cbArgs: unknown[]) => unknown = typeof callback === "function"
                    ? (...cbArgs: unknown[]) => (callback as (...args: unknown[]) => unknown)(...cbArgs)
```

### pollingMonitor.ts:172:requestAnimationFrame

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 172
- **Type**: requestAnimationFrame
- **Code**: `logger.debug(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);`

**Context**:

```
            };

            this.calls.set(id, call);

            if (call.disabled) {
                logger.debug(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);
                return id;
            }

            const wrappedCallback = (time: number) => {
                call.executionCount++;
```

### projectPageLoader.ts:34:setTimeout

- **File**: `/app/client/src/lib/projectPageLoader.ts`
- **Line**: 34
- **Type**: setTimeout
- **Code**: `const timeout = setTimeout(() => {`

**Context**:

```
    // This avoids race conditions and 500ms hardcoded polling limits
    if (client.wsProvider && !client.wsProvider.isSynced) {
        logger.info(`loadProjectAndPage: Waiting for provider sync...`);
        try {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Provider sync timeout"));
                }, 10000); // 10 second timeout

                const onSync = () => {
                    clearTimeout(timeout);
```

### touchTextSelection.ts:149:setTimeout

- **File**: `/app/client/src/lib/touchTextSelection.ts`
- **Line**: 149
- **Type**: setTimeout
- **Code**: `this.longPressTimer = setTimeout(() => {`

**Context**:

```
        this.startY = event.clientY;
        this.movedBeyondSlop = false;
        this.selecting = false;

        this.clearLongPressTimer();
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = undefined;
            if (this.pointerId === undefined || this.movedBeyondSlop) return;
            this.selecting = true;
            this.handlers.onLongPress({ clientX: this.startX, clientY: this.startY });
        }, this.longPressMs);
```

### connection.ts:147:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 147
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(finish, timeoutMs);`

**Context**:

```
            clearTimeout(timer);
            unsubscribe?.();
            resolve();
        };

        const timer = setTimeout(finish, timeoutMs);

        try {
            unsubscribe = onAuthStateChanged(auth, user => {
                if (user) finish();
            });
```

### connection.ts:339:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 339
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, attempt * 1000));`

**Context**:

```
                    { error: e },
                    `[${label}] getFreshIdToken failed (attempt ${attempt}/${MAX_TOKEN_RETRIES})`,
                );
                if (attempt < MAX_TOKEN_RETRIES) {
                    // Exponential backoff: 1s, 2s
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                }
            }
        }

        throw lastError || new Error("Failed to get token");
```

### connection.ts:532:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 532
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:

```
                clearTimeout(timer);
                provider.off("synced", syncHandler);
                provider.off("close", closeHandler);
            };

            const timer = setTimeout(() => {
                logger.warn(
                    `[${label}] Timeout (${timeoutMs}ms) waiting for initial sync, proceeding anyway for room: ${room}`,
                );
                setRoomSyncState(room, "timed-out");
                cleanup();
```

### testHelpers.ts:64:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 64
- **Type**: setTimeout
- **Code**: `await new Promise((r) => setTimeout(r, pollIntervalMs));`

**Context**:

```
            if (debugEnabled) {
                console.info(`[${label}] provider.isSynced=true after ${i * pollIntervalMs}ms`);
            }
            break;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Step 2: Wait for actual data to be available
    for (let i = 0; i < maxIterations; i++) {
        if (checkDataAvailable()) {
```

### testHelpers.ts:75:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 75
- **Type**: setTimeout
- **Code**: `await new Promise((r) => setTimeout(r, pollIntervalMs));`

**Context**:

```
            if (debugEnabled) {
                console.info(`[${label}] data available after ${i * pollIntervalMs}ms from synced`);
            }
            return true;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (debugEnabled) {
        console.info(
            `[${label}] timeout after ${timeoutMs}ms, isSynced=${provider.isSynced}, dataAvailable=${checkDataAvailable()}`,
```

### testHelpers.ts:204:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 204
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

### testHelpers.ts:210:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 210
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
            // Note: this callback runs in the browser context via page.evaluate, so the
            // Node-side `logger` is unavailable here; use console directly.
            console.info(`[${pv}] reconnected, isSynced=${provider.isSynced}`);
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

### yjsPersistence.test.ts:332:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.test.ts`
- **Line**: 332
- **Type**: setTimeout
- **Code**: `setTimeout(resolve, 500); // resolve after timeout`

**Context**:

```
        const mockPersistence = {
            synced: false,
            once: () => {},
            off: () => {},
            _db: new Promise(resolve => {
                setTimeout(resolve, 500); // resolve after timeout
            }),
        };

        // Wait for sync, expecting a timeout
        let err;
```

### yjsPersistence.ts:65:setTimeout

- **File**: `/app/client/src/lib/yjsPersistence.ts`
- **Line**: 65
- **Type**: setTimeout
- **Code**: `const timeoutId = setTimeout(() => {`

**Context**:

```
        // Note: lib0's once() wraps the handler, making off() unreliable with the same reference.
        // We rely on persistence.destroy() on error to clean up the listeners.
        persistence.once("synced", onSynced);

        const timeoutId = setTimeout(() => {
            reject(new TimeoutError("waitForSync timed out"));
        }, timeoutMs);

        if (persistence._db) {
            persistence._db.catch((err) => {
```

### yjsService.svelte.ts:177:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 177
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 500));`

**Context**:

```
    const saved = await saveProjectIdToServer(projectId, projectName);
    if (saved) {
        logger.info(`[yjsService] Project ID saved successfully on attempt ${attempt}.`);
        registrationSuccess = true;
        // Wait for Firestore propagation (important for subsequent reads)
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
    } else {
        logger.warn(`[yjsService] saveProjectIdToServer returned false on attempt ${attempt}.`);
    }
} catch (saveError) {
```

### yjsService.svelte.ts:188:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 188
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 1000 * attempt));`

**Context**:

```
                logger.error({ error: saveError }, `[yjsService] Exception saving project ID (attempt ${attempt})`);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        if (!registrationSuccess) {
            logger.warn(
```

### yjsService.svelte.ts:287:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 287
- **Type**: setTimeout
- **Code**: `const timeout = setTimeout(() => {`

**Context**:

```
                        resolve();
                    }
                });
            });

            const timeout = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanupEffect();
                    // Resolve with undefined instead of rejecting
                    logger.warn(`[resolveProjectId] Timeout waiting for project data from the server.`);
```

### yjsService.svelte.ts:658:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 658
- **Type**: setTimeout
- **Code**: `backoffTimeout = setTimeout(scheduleProcessPending, 1000);`

**Context**:

```
        if (pendingCount === 0) {
            backoffTimeout = undefined;
            return;
        }
        if (isProcessingPending) {
            backoffTimeout = setTimeout(scheduleProcessPending, 1000);
            return;
        }
        isProcessingPending = true;

        try {
```

### yjsService.svelte.ts:675:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 675
- **Type**: setTimeout
- **Code**: `backoffTimeout = setTimeout(run, delay);`

**Context**:

```
    const remaining = getPendingRegistrations().length;
    if (remaining > 0 && attempt < maxAttempt) {
        attempt++;
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        backoffTimeout = setTimeout(run, delay);
    } else {
        backoffTimeout = undefined;
    }
};
```

### yjsService.svelte.ts:703:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 703
- **Type**: setTimeout
- **Code**: `const initTimeout = setTimeout(() => {`

**Context**:

```
        if (pendingCount > 0 && navigator.onLine && userManager.getCurrentUser()) scheduleProcessPending();
    };

    let cleanupPendingMap = () => {};
    // Delay binding until next tick to ensure pendingRegistrationsMap is initialized
    const initTimeout = setTimeout(() => {
        if (
            typeof pendingRegistrationsMap !== "undefined" && pendingRegistrationsMap
            && typeof pendingRegistrationsMap.observe === "function"
        ) {
            try {
```

### +page.svelte:98:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 98
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            return;
        }
        lastLoadKey = key;

        // Defer to event loop to avoid reactivity depth issues
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }

    // Handle auth success
```

### +page.svelte:384:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 384
- **Type**: setTimeout
- **Code**: `await new Promise((resolve) => setTimeout(resolve, 100));`

**Context**:

```
            );
            let retryCount = 0;
            const maxRetries = 50; // Wait for 5 seconds

            while (!currentUser && retryCount < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                currentUser = userManager.getCurrentUser();
                retryCount++;

                if (retryCount % 10 === 0) {
                    logger.info(
```

### +page.svelte:451:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 451
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            }
        }

        // Setup link preview handlers after page load
        // Wait for DOM to be fully loaded
        setTimeout(() => {
            setupLinkPreviewHandlers();
        }, 500);

        if (pageName) {
            searchHistoryStore.add(pageName);
```

### +page.svelte:239:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 239
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
    logger.debug("Schedule page: Exported schedules to iCal", filename);
}
catch (err) {
    logger.error({ error: err }, "Schedule page: Error exporting schedules:");
}
```

### +page.svelte:161:setInterval

- **File**: `/app/client/src/routes/debug/+page.svelte`
- **Line**: 161
- **Type**: setInterval
- **Code**: `statusInterval = setInterval(() => {`

**Context**:

```
        if (isAuthenticated) {
            initializeFluidClient();
        }

        // Update connection status periodically (every 5 seconds)
        statusInterval = setInterval(() => {
            updateConnectionStatus();
        }, 5000);
    }
    catch (err) {
        logger.error({ error: err }, "Error initializing debug page:");
```

### +page.svelte:73:setTimeout

- **File**: `/app/client/src/routes/demo/+page.svelte`
- **Line**: 73
- **Type**: setTimeout
- **Code**: `setTimeout(() => { resetDone = false; }, 3000);`

**Context**:

```
    if (isDestroyed) return;
    if (!handle) {
        throw new Error("Failed to connect to the demo project.");
    }
    resetDone = error === undefined;
    setTimeout(() => { resetDone = false; }, 3000);
} catch (err) {
    if (err instanceof SeedDemoError && err.rateLimitMs !== undefined) {
        const minutes = Math.ceil(err.rateLimitMs / 60000);
        resetError = `You can only reset the demo content once every ${minutes} minutes. Please try again later.`;
    } else if (err instanceof Error && err.message.includes("rate limited")) {
```

### +page.svelte:46:setTimeout

- **File**: `/app/client/src/routes/demo/[page]/+page.svelte`
- **Line**: 46
- **Type**: setTimeout
- **Code**: `resetTimeout = setTimeout(updateReset, 60000 - (now - resetStartedAt));`

**Context**:

```
                const now = Date.now();
                clearTimeout(resetTimeout);

                if (isResetting && resetStartedAt && now - resetStartedAt < 60000) {
                    isServerResetting = true;
                    resetTimeout = setTimeout(updateReset, 60000 - (now - resetStartedAt));
                } else {
                    isServerResetting = false;
                }
            };
            updateReset();
```

### page.svelte.test.ts:134:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 134
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 0));`

**Context**:

```
        );

        await fireEvent.click(confirmButton);

        // Wait a tick for the state to update
        await new Promise(resolve => setTimeout(resolve, 0));

        // After click, isResetting should be true because the mock hasn't resolved
        expect(resetButton).toBeDisabled();
        expect(resetButton).toHaveClass("bg-gray-300");
        expect(resetButton).toHaveClass("text-gray-500");
```

### +page.svelte:77:setTimeout

- **File**: `/app/client/src/routes/projects/delete/+page.svelte`
- **Line**: 77
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        }

        if (!error && deletedCount > 0) {
            success = "Selected projects have been deleted";
            // Reload the page after a short delay to update the project list after deletion
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
        loading = false;
    }
```

### +page.svelte:71:setTimeout

- **File**: `/app/client/src/routes/projects/new/+page.svelte`
- **Line**: 71
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        yjsStore.yjsClient = newClient;

        success = `New outliner created! (ID: ${createdContainerId})`;

        // Navigate to the created project page after 1.5 seconds
        setTimeout(() => {
            goto(resolvePath("/" + encodeURIComponent(containerName)));
        }, 1500);
    }
    catch (err) {
        logger.error({ error: err as Error }, "Error creating new outliner:");
```

### +page.svelte:99:setTimeout

- **File**: `/app/client/src/routes/settings/[project]/+page.svelte`
- **Line**: 99
- **Type**: setTimeout
- **Code**: `const timeout = setTimeout(() => {`

**Context**:

```
                                resolve(true);
                            }
                        });
                    });

                    const timeout = setTimeout(() => {
                        if (!isResolved) {
                            isResolved = true;
                            cleanupEffect();
                            resolve(false);
                        }
```

### +page.svelte:53:setTimeout

- **File**: `/app/client/src/routes/share/[token]/+page.svelte`
- **Line**: 53
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            }

            const data = await res.json();
            status = "success";
            message = "Successfully joined! Redirecting to project...";
            setTimeout(() => {
                const navPath = data.projectTitle ? `/${encodeURIComponent(data.projectTitle)}` : `/${data.projectId}`;
                goto(resolvePath(navPath));
            }, 1500);
        } catch (e: unknown) {
            status = "error";
```

### itemsRelationWrite.test.ts:162:setTimeout

- **File**: `/app/client/src/services/yjstable/itemsRelationWrite.test.ts`
- **Line**: 162
- **Type**: setTimeout
- **Code**: `await new Promise((resolve) => setTimeout(resolve, 20));`

**Context**:

```
            expect(f.item.due).toBeUndefined();
            expect(f.item.text).toBe("Review");

            // Deleting the item removes it from the outline as well.
            f.item.due = "2026-08-01T09:00:00Z";
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(await f.rows()).toHaveLength(1);

            await f.provider.applyWrite({
                op: "DELETE",
                rowId: f.item.key,
```

### tableSyncAdapter.test.ts:284:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 284
- **Type**: setTimeout
- **Code**: `await new Promise((resolve) => setTimeout(resolve, 50));`

**Context**:

```
                handles.schemaText.delete(0, handles.schemaText.length);
                handles.schemaText.insert(0, "CREATE TABLE renamed (id TEXT PRIMARY KEY, note TEXT)");
            }, "remote");
            await waitMicrotasks();
            // Allow the async rebuild to finish.
            await new Promise((resolve) => setTimeout(resolve, 50));

            handles.uiDef.set("query", "SELECT id, note FROM renamed");
            addRecord(handles, { note: "n" });
            await waitMicrotasks();
            const result = await adapter.runQueryNow();
```

### tableSyncAdapter.test.ts:331:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 331
- **Type**: setTimeout
- **Code**: `await new Promise((resolve) => setTimeout(resolve, 100)); // allow async upsert`

**Context**:

```
    due_date: "2026-07-15",
    start_time: "2026-07-15T12:30:00",
    other_time: "2026-07-15T15:45:00Z",
}, "r1");
await waitMicrotasks();
await new Promise((resolve) => setTimeout(resolve, 100)); // allow async upsert
const result = await adapter.runQueryNow();
expect(result?.rows).toHaveLength(1);
expect(result?.rows[0].due_date).toBe("2026-07-15");
expect(result?.rows[0].start_time).toBe("2026-07-15T12:30:00.000Z");
expect(result?.rows[0].other_time).toBe("2026-07-15T15:45:00.000Z");
```

### tableSyncAdapter.ts:446:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.ts`
- **Line**: 446
- **Type**: setTimeout
- **Code**: `this.requeryTimer = setTimeout(() => {`

**Context**:

```
    // ------------------------------------------------------------------

    /** Debounced re-run of the UI Definition query. */
    scheduleRequery(): void {
        if (this.requeryTimer !== undefined) clearTimeout(this.requeryTimer);
        this.requeryTimer = setTimeout(() => {
            this.requeryTimer = undefined;
            void this.runQueryNow();
        }, REQUERY_DEBOUNCE_MS);
    }
```

### EditorOverlayStore.svelte.ts:270:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 270
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
                if (textarea && !isForeignInput(document.activeElement)) {
                    // Multiple attempts to ensure focus is set
                    textarea.focus();

                    // Set focus using requestAnimationFrame and tick
                    requestAnimationFrame(() => {
                        if (isForeignInput(document.activeElement)) return;
                        textarea.focus();

                        tick().then(() => {
                            setTimeout(() => {
```

### EditorOverlayStore.svelte.ts:275:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 275
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    requestAnimationFrame(() => {
                        if (isForeignInput(document.activeElement)) return;
                        textarea.focus();

                        tick().then(() => {
                            setTimeout(() => {
                                if (isForeignInput(document.activeElement)) return;
                                textarea.focus();

                                // Debug info
                                if (
```

### EditorOverlayStore.svelte.ts:356:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 356
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
            if (textarea) {
                // Multiple attempts to ensure focus is set
                textarea.focus();

                // Set focus using requestAnimationFrame and tick
                requestAnimationFrame(() => {
                    textarea.focus();

                    tick().then(() => {
                        setTimeout(() => {
                            textarea.focus();
```

### EditorOverlayStore.svelte.ts:360:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 360
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                // Set focus using requestAnimationFrame and tick
                requestAnimationFrame(() => {
                    textarea.focus();

                    tick().then(() => {
                        setTimeout(() => {
                            textarea.focus();

                            // Debug info
                            if (
                                typeof window !== "undefined"
```

### EditorOverlayStore.svelte.ts:586:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 586
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            logger.debug(`Current selections:`, this.selections);
        }

        // Set isUpdating to false after 300ms
        // Note: Using setTimeout here is correct for intentional delayed execution, not macro-task hacking.
        setTimeout(() => {
            const currentSelection = this.selections[key];
            if (currentSelection && currentSelection.isUpdating) {
                // Create a new object and replace it so Svelte can detect the change
                this.selections = {
                    ...this.selections,
```

### EditorOverlayStore.svelte.ts:990:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 990
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Force update by temporarily clearing and resetting selection ranges
        const tempSelections = { ...this.selections };
        this.selections = {};

        // Reset after a short wait
        setTimeout(() => {
            this.selections = tempSelections;
        }, 0);

        // Update cursors similarly
        const tempCursors = { ...this.cursors };
```

### EditorOverlayStore.svelte.ts:998:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 998
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Update cursors similarly
        const tempCursors = { ...this.cursors };
        this.cursors = {};

        setTimeout(() => {
            this.cursors = tempCursors;
        }, 0);
    }

    /**
```

### EditorOverlayStore.svelte.ts:1161:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 1161
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
// Ensure reliable focus on global textarea to receive input
const textarea = this.getTextareaRef();
if (textarea && !isForeignInput(document.activeElement)) {
    try {
        textarea.focus();
        requestAnimationFrame(() => {
            if (isForeignInput(document.activeElement)) return;
            textarea.focus();
        });
        tick().then(() => {
            if (isForeignInput(document.activeElement)) return;
```

### EditorOverlayStore.svelte.ts:1614:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 1614
- **Type**: setTimeout
- **Code**: `this._selectionSyncTimeout = setTimeout(() => {`

**Context**:

```
        // Do not clear the flag in a microtask. Wait for the selectionchange event.
        // The event handler will clear it, or a timeout will clear it as a fallback.
        if (this._selectionSyncTimeout) {
            clearTimeout(this._selectionSyncTimeout);
        }
        this._selectionSyncTimeout = setTimeout(() => {
            this.suppressSelectionResync = false;
        }, 50) as unknown as number;
    }

    syncTextareaToSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
```

### store.svelte.ts:398:setTimeout

- **File**: `/app/client/src/stores/store.svelte.ts`
- **Line**: 398
- **Type**: setTimeout
- **Code**: `snapshotTimeout = setTimeout(() => {`

**Context**:

```
    if (state && state !== "synced") {
        isInitialSync = true;
    }
}
if (!isInitialSync) {
    snapshotTimeout = setTimeout(() => {
        snapshotTimeout = null;
        try {
            saveProjectSnapshot(project);
        } catch (_e) {
            logger.error(_e);
```

### snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts:50:setTimeout

- **File**: `/app/client/src/tests/integration/snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts`
- **Line**: 50
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
        // HTML should be rendered in the diff area
        const diffs = document.querySelectorAll(".diff-view");
        expect(diffs.length).toBeGreaterThan(0);

        // Wait for reactivity
        await new Promise(r => setTimeout(r, 100));

        let htmlContent = "";
        diffs.forEach(diff => htmlContent += diff.innerHTML);

        expect(htmlContent).toContain("ins");
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:22:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 22
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

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:24:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 24
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

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:33:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 33
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 500));`

**Context**:

```
        });

        // Use awareness from project connection
        c1.awareness!.setLocalStateField("user", { userId: "u1", name: "A" });
        c1.awareness!.setLocalStateField("presence", { cursor: { itemId: "root", offset: 0 } });
        await new Promise(r => setTimeout(r, 500));

        type AwarenessState = {
            user?: { userId: string; name: string; color?: string; };
            presence?: { cursor?: { itemId: string; offset: number; }; };
        };
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:46:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 46
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
        let received = false;
        for (let i = 0; i < 20; i++) {
            const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
            received = Array.from(states.values()).some(s => s.presence?.cursor?.itemId === "root");
            if (received) break;
            await new Promise(r => setTimeout(r, 100));
        }

        const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
        logger.debug("States size:", states.size);
        logger.debug("States values:", Array.from(states.values()));
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:57:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 57
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 0));`

**Context**:

```
        logger.debug("Received:", received);
        expect(received).toBe(true);

        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});
```

### connectionSharedSetup.spec.ts:134:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/connectionSharedSetup.spec.ts`
- **Line**: 134
- **Type**: setTimeout
- **Code**: `const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));`

**Context**:

```
};

// setupProviderForRoom awaits persistence attachment before constructing the provider, so the
// mock instance doesn't exist synchronously after calling createProjectConnection. A macrotask
// tick reliably drains any pending microtask chain in between.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("yjs connection: shared provider setup", () => {
    beforeEach(() => {
        MockHocuspocusProvider.instances = [];
        getIdTokenSpy.mockClear();
```

### yjs-persistence.spec.ts:100:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/yjs-persistence.spec.ts`
- **Line**: 100
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

### yjs-persistence.spec.ts:114:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/yjs-persistence.spec.ts`
- **Line**: 114
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

### UserManager.ts:341:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 341
- **Type**: setTimeout

### AuthComponent.svelte:71:setTimeout

- **File**: `/app/client/src/components/AuthComponent.svelte`
- **Line**: 71
- **Type**: setTimeout

### EditorOverlay.svelte:367:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 367
- **Type**: setTimeout

### SearchPanel.svelte:292:requestAnimationFrame

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 292
- **Type**: requestAnimationFrame

### projectPageLoader.ts:75:setTimeout

- **File**: `/app/client/src/lib/projectPageLoader.ts`
- **Line**: 75
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

### yjsService.svelte.ts:260:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 260
- **Type**: setTimeout

### +page.svelte:195:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 195
- **Type**: setTimeout

### +page.svelte:432:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 432
- **Type**: setTimeout

### +page.svelte:139:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 139
- **Type**: setTimeout

### +page.svelte:241:setTimeout

- **File**: `/app/client/src/routes/[project]/settings/+page.svelte`
- **Line**: 241
- **Type**: setTimeout

### +page.svelte:83:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 83
- **Type**: setTimeout

### +page.svelte:97:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 97
- **Type**: setTimeout

### +page.svelte:145:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 145
- **Type**: setTimeout

### +page.svelte:159:setTimeout

- **File**: `/app/client/src/routes/clipboard-test/+page.svelte`
- **Line**: 159
- **Type**: setTimeout

### page.svelte.test.ts:76:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 76
- **Type**: setTimeout

### page.svelte.test.ts:105:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 105
- **Type**: setTimeout

### page.svelte.test.ts:113:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 113
- **Type**: setTimeout

### itemsRelation.calendarTime.test.ts:53:setTimeout

- **File**: `/app/client/src/services/yjstable/itemsRelation.calendarTime.test.ts`
- **Line**: 53
- **Type**: setTimeout

### itemsRelation.recurrence.test.ts:57:setTimeout

- **File**: `/app/client/src/services/yjstable/itemsRelation.recurrence.test.ts`
- **Line**: 57
- **Type**: setTimeout

### itemsRelation.tags.test.ts:45:setTimeout

- **File**: `/app/client/src/services/yjstable/itemsRelation.tags.test.ts`
- **Line**: 45
- **Type**: setTimeout

### itemsRelation.test.ts:47:setTimeout

- **File**: `/app/client/src/services/yjstable/itemsRelation.test.ts`
- **Line**: 47
- **Type**: setTimeout

### relationRowWrite.test.ts:26:setTimeout

- **File**: `/app/client/src/services/yjstable/relationRowWrite.test.ts`
- **Line**: 26
- **Type**: setTimeout

### tableSyncAdapter.test.ts:22:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 22
- **Type**: setTimeout

### AliasPickerStore.svelte.ts:54:setTimeout

- **File**: `/app/client/src/stores/AliasPickerStore.svelte.ts`
- **Line**: 54
- **Type**: setTimeout

### itm-add-new-items-with-enter-49d26e99.integration.spec.ts:20:setTimeout

- **File**: `/app/client/src/tests/integration/itm-add-new-items-with-enter-49d26e99.integration.spec.ts`
- **Line**: 20
- **Type**: setTimeout

### setup.ts:48:setTimeout

- **File**: `/app/client/src/tests/integration/setup.ts`
- **Line**: 48
- **Type**: setTimeout

## Necessary Polling

These are pollings with clear purposes and should not be removed.
