# Polling Analysis Report

Generated at: 2026-07-21T08:52:39.342Z

## Overview

- Total Polling Count: 137
- Necessary Polling: 3
- Suspicious Polling: 104
- Test-Only Polling: 30

## Suspicious Polling (Removal Candidates)

These pollings may be safe to remove.

### UserManager.ts:376:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 376
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

### AliasPicker.svelte:102:setTimeout

- **File**: `/app/client/src/components/AliasPicker.svelte`
- **Line**: 102
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
if (aliasPickerStore.isVisible) {
    try {
        // First, the picker body
        pickerElement?.focus();
        // Next, the search input (if it exists)
        setTimeout(() => {
            inputElement?.focus();
        }, 0);
        // Sync selected index to external store
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
    } catch {}
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

### Checklist.svelte:34:setInterval

- **File**: `/app/client/src/components/Checklist.svelte`
- **Line**: 34
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

### EditorOverlay.svelte:720:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 720
- **Type**: setTimeout
- **Code**: `updatePositionMapTimer = setTimeout(() => {`

**Context**:

```
let updatePositionMapTimer: ReturnType<typeof setTimeout>;

// Update position map with debounce
function debouncedUpdatePositionMap() {
    clearTimeout(updatePositionMapTimer);
    updatePositionMapTimer = setTimeout(() => {
        if (!aliasPickerStore.isVisible) updatePositionMap();
    }, 100);
}

// Data reflection from store is guaranteed by MutationObserver and onMount initialization
```

### EditorOverlay.svelte:793:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 793
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        treeContainer.addEventListener('scroll', debouncedUpdatePositionMap);
    }


    // If there is an active cursor in the initial state, start blinking after a short delay
    setTimeout(() => {
        if (cursorList.some(cursor => cursor.isActive)) {
            store.startCursorBlink();
        }
    }, 200);
});
```

### EditorOverlay.svelte:1408:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 1408
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

### GlobalTextArea.svelte:61:requestAnimationFrame

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 61
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:

```
    if (textareaRef) {
        textareaRef.focus();
        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: Initial focus set on mount, activeElement:", document.activeElement?.tagName);

        // Additional attempts to ensure focus
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
```

### GlobalTextArea.svelte:66:setTimeout

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 66
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        requestAnimationFrame(() => {
            if (textareaRef) {
                textareaRef.focus();
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: RAF focus set, activeElement:", document.activeElement?.tagName);

                setTimeout(() => {
                    if (textareaRef) {
                        textareaRef.focus();
                        const isFocused = document.activeElement === textareaRef;
                        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("GlobalTextArea: Final focus set, focused:", isFocused);
                    }
```

### GlobalTextArea.svelte:227:setTimeout

- **File**: `/app/client/src/components/GlobalTextArea.svelte`
- **Line**: 227
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
                if (activeEl) {
                    const activeTag = activeEl.tagName.toLowerCase();
```

### GraphView.svelte:248:setTimeout

- **File**: `/app/client/src/components/GraphView.svelte`
- **Line**: 248
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

### OutlinerBase.svelte:71:setTimeout

- **File**: `/app/client/src/components/OutlinerBase.svelte`
- **Line**: 71
- **Type**: setTimeout
- **Code**: `previewUpdateTimeout = setTimeout(() => {`

**Context**:

```
        const currentDoc = effectivePageItem.ydoc;
        if (!currentDoc) return;

        const updatePreviewDebounced = () => {
            clearTimeout(previewUpdateTimeout);
            previewUpdateTimeout = setTimeout(() => {
                if (!effectivePageItem) return;
                try {
                    const newPreview = extractPagePreview(effectivePageItem);
                    const oldPreview = effectivePageItem.preview;
                    if (JSON.stringify(newPreview) !== JSON.stringify(oldPreview)) {
```

### OutlinerItem.svelte:219:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 219
- **Type**: setTimeout
- **Code**: `const t = setTimeout(() => {`

**Context**:

```
// findReferringAliases when there is actual activity, significantly reducing idle CPU usage.
let debouncedTreeVersion = $state(0);
$effect(() => {
    // Using pagesVersion to track global structure changes
    const v = generalStore.pagesVersion;
    const t = setTimeout(() => {
        debouncedTreeVersion = v;
    }, 500);
    return () => clearTimeout(t);
});
```

### OutlinerItem.svelte:771:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 771
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

        setTimeout(() => {
            textareaEl.focus();
```

### OutlinerItem.svelte:774:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 774
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    // Additional attempts to ensure focus
    requestAnimationFrame(() => {
        textareaEl.focus();

        setTimeout(() => {
            textareaEl.focus();

        }, 10);
    });
    // Synchronize text content
```

### OutlinerItem.svelte:1001:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1001
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

### OutlinerItem.svelte:1098:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1098
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

                // Use setTimeout as well for further certainty
                setTimeout(() => {
                    textarea.focus();
```

### OutlinerItem.svelte:1102:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1102
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            // requestAnimationFrame
            requestAnimationFrame(() => {
                textarea.focus();

                // Use setTimeout as well for further certainty
                setTimeout(() => {
                    textarea.focus();

                }, 10);
            });
        }
```

### OutlinerTree.svelte:99:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 99
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

### OutlinerTree.svelte:900:setTimeout

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 900
- **Type**: setTimeout
- **Code**: `setTimeout(focusNewItem, 10);`

**Context**:

```
                        `Sent finish-edit event to active item ${activeItem}`,
                    );
                }

                // Delay slightly before focusing new item to ensure processing order
                setTimeout(focusNewItem, 10);
            } else {
                // Focus immediately if active element not found
                focusNewItem();
            }
        } else {
```

### ProjectSelector.svelte:163:setTimeout

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 163
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

### SearchBox.svelte:66:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 66
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

### SearchBox.svelte:363:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 363
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

### Cursor.ts:162:requestAnimationFrame

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 162
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

                    // Use setTimeout as well for extra reliability
                    setTimeout(() => {
                        textarea.focus();
```

### Cursor.ts:166:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 166
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    textarea.focus();

                    // Use setTimeout as well for extra reliability
                    setTimeout(() => {
                        textarea.focus();

                        // Debug information
                        if (
                            typeof window !== "undefined"
```

### Cursor.ts:596:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 596
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
        // Set selection range for global textarea
        this.updateGlobalTextareaSelection(startItemId, startOffset, endItemId, endOffset);

        // Wait a bit for DOM reflection to ensure selection is correctly created
        if (typeof window !== "undefined") {
            setTimeout(() => {
                if (typeof document === "undefined") return;
                const selectionElements = document.querySelectorAll(".editor-overlay .selection");

                // Reset selection if not displayed
                if (selectionElements.length === 0) {
```

### KeyEventHandler.ts:728:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 728
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

### KeyEventHandler.ts:752:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 752
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
        }
    } catch {}
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

### KeyEventHandler.ts:801:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 801
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

### KeyEventHandler.ts:809:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 809
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

### KeyEventHandler.ts:831:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 831
- **Type**: setTimeout
- **Code**: `setTimeout(() => tryOpen(attempt + 1), 10);`

**Context**:

```
        }
    } catch {}
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

### KeyEventHandler.ts:1019:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1019
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

### KeyEventHandler.ts:1023:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1023
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

### KeyEventHandler.ts:1398:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1398
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

### KeyEventHandler.ts:1557:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1557
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

### KeyEventHandler.ts:1559:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1559
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

### CursorEditor.ts:808:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorEditor.ts`
- **Line**: 808
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

### connection.ts:368:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 368
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

### testHelpers.ts:61:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 61
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

### testHelpers.ts:72:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 72
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

### yjsService.svelte.ts:192:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 192
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

### yjsService.svelte.ts:203:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 203
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

### yjsService.svelte.ts:347:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 347
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
                    reject(
                        new Error(
```

### yjsService.svelte.ts:641:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 641
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
    }
}

if (typeof window !== "undefined") {
    // Process on startup (wait a bit for auth to initialize)
    setTimeout(() => {
        void processPendingRegistrations();
    }, 5000);

    // Process on network recovery
    window.addEventListener("online", () => {
```

### +page.svelte:99:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 99
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

### +page.svelte:439:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 439
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

### +page.svelte:504:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 504
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            };
        }

        // Setup link preview handlers after page load
        // Wait for DOM to be fully loaded
        setTimeout(() => {
            setupLinkPreviewHandlers();
        }, 500);

        if (pageName) {
            searchHistoryStore.add(pageName);
```

### +page.svelte:123:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 123
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:

```
            // but we need this async execution to continue and navigate us back!
            if ((store.project?.items?.length ?? 0) > 0) {
                logger.debug("Schedule page: store.project populated after", i * 100, "ms");
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        logger.debug("Schedule page: store.project?.items?.length =", store.project?.items?.length ?? 0);

        // Navigate back to schedule page
        const scheduleUrl = `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}/schedule`;
```

### +page.svelte:170:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 170
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

### +page.svelte:181:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 181
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
        if (hasProject && !projectHasItems) {
            logger.debug("Schedule page: Project exists but has no items, triggering parent load");
            await triggerParentPageLoad();
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        parentLoadWaitAttempts++;
    }

    // After waiting, check store.project directly for debugging
    logger.debug("Schedule page: Final store state", {
```

### +page.svelte:359:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 359
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
    logger.debug("Schedule page: After wait", {
        waitAttempts,
        hasFoundPage: !!foundPageRef,
```

### +page.svelte:447:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 447
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:

```
                if (itemCount > 0) {
                    logger.debug("Schedule page: Page items found", { pageId, itemCount });
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
} catch (e) {
    logger.warn("Schedule page: Error waiting for page items:", e);
}
```

### +page.svelte:596:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 596
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

### +page.svelte:75:setTimeout

- **File**: `/app/client/src/routes/demo/+page.svelte`
- **Line**: 75
- **Type**: setTimeout
- **Code**: `setTimeout(() => { resetDone = false; }, 3000);`

**Context**:

```
    yjsStore.yjsClient = undefined;
    store.project = undefined;
    await initializeDemo();
    if (isDestroyed) return;
    resetDone = error === undefined;
    setTimeout(() => { resetDone = false; }, 3000);
} catch (err) {
    if (err instanceof SeedDemoError && err.rateLimitMs !== undefined) {
        const minutes = Math.ceil(err.rateLimitMs / 60000);
        resetError = `You can only reset the demo content once every ${minutes} minutes. Please try again later.`;
    } else if (err instanceof Error && err.message.includes("rate limited")) {
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

### +page.svelte:88:setInterval

- **File**: `/app/client/src/routes/settings/[project]/+page.svelte`
- **Line**: 88
- **Type**: setInterval
- **Code**: `const checkInterval = setInterval(() => {`

**Context**:

```
                // Maybe I should stay on the page and show "Saved!" until the store updates?
                // Or just redirect and hope? Or show a spinner "Updating...".

                // Let's implement a wait loop for the store to reflect the change before redirecting.
                const checkInterval = setInterval(() => {
                   const updated = projectStore.projects.find(p => p.name === newTitle);
                   if (updated) {
                       clearInterval(checkInterval);
                       goto(resolvePath(`/settings/${encodeURIComponent(newTitle)}`), { replaceState: true });
                   }
```

### +page.svelte:97:setTimeout

- **File**: `/app/client/src/routes/settings/[project]/+page.svelte`
- **Line**: 97
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                       goto(resolvePath(`/settings/${encodeURIComponent(newTitle)}`), { replaceState: true });
                   }
                }, 100);

                // Safety timeout
                setTimeout(() => {
                    clearInterval(checkInterval);
                    // Fallback redirect
                    goto(resolvePath(`/settings/${encodeURIComponent(newTitle)}`), { replaceState: true });
                }, 5000);
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

### tableSyncAdapter.test.ts:164:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 164
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

### tableSyncAdapter.test.ts:211:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 211
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

### tableSyncAdapter.ts:331:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.ts`
- **Line**: 331
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

### CommandPaletteStore.svelte.ts:383:setTimeout

- **File**: `/app/client/src/stores/CommandPaletteStore.svelte.ts`
- **Line**: 383
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

### EditorOverlayStore.svelte.ts:257:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 257
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

                        // Use setTimeout as well for extra certainty
                        setTimeout(() => {
                            textarea.focus();
```

### EditorOverlayStore.svelte.ts:261:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 261
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                    // Set focus using requestAnimationFrame
                    requestAnimationFrame(() => {
                        textarea.focus();

                        // Use setTimeout as well for extra certainty
                        setTimeout(() => {
                            textarea.focus();

                            // Debug info
                            if (
                                typeof window !== "undefined"
```

### EditorOverlayStore.svelte.ts:340:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 340
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

                    // Use setTimeout as well for extra certainty
                    setTimeout(() => {
                        textarea.focus();
```

### EditorOverlayStore.svelte.ts:344:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 344
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    textarea.focus();

                    // Use setTimeout as well for extra certainty
                    setTimeout(() => {
                        textarea.focus();

                        // Debug info
                        if (
                            typeof window !== "undefined"
```

### EditorOverlayStore.svelte.ts:560:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 560
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:

```
            logger.debug(`Box selection set with key: ${key}`);
            logger.debug(`Current selections:`, this.selections);
        }

        // Set isUpdating to false after 300ms
        setTimeout(() => {
            const currentSelection = this.selections[key];
            if (currentSelection && currentSelection.isUpdating) {
                // Create a new object and replace it so Svelte can detect the change
                this.selections = {
                    ...this.selections,
```

### EditorOverlayStore.svelte.ts:711:setInterval

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 711
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

### EditorOverlayStore.svelte.ts:902:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 902
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

### EditorOverlayStore.svelte.ts:910:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 910
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

### EditorOverlayStore.test.ts:85:setInterval

- **File**: `/app/client/src/stores/EditorOverlayStore.test.ts`
- **Line**: 85
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

### store.svelte.ts:309:setTimeout

- **File**: `/app/client/src/stores/store.svelte.ts`
- **Line**: 309
- **Type**: setTimeout
- **Code**: `snapshotTimeout = setTimeout(() => {`

**Context**:

```
// If it is, skip saving entirely since it will get saved after sync or on next edit.
const isInitialSync = typeof window !== "undefined"
    && (window as unknown as { __YJS_STORE__?: { notYetSynced?: boolean; }; }).__YJS_STORE__
        ?.notYetSynced;
if (!isInitialSync) {
    snapshotTimeout = setTimeout(() => {
        snapshotTimeout = null;
        try {
            saveProjectSnapshot(project);
        } catch {}
    }, 3000);
```

### snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts:51:setTimeout

- **File**: `/app/client/src/tests/integration/snapshot-diff-modal-a11y-9f2d1c3a.integration.spec.ts`
- **Line**: 51
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

### connectionSharedSetup.spec.ts:104:setTimeout

- **File**: `/app/client/src/tests/unit/yjs/connectionSharedSetup.spec.ts`
- **Line**: 104
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

### UserManager.ts:338:setTimeout

- **File**: `/app/client/src/auth/UserManager.ts`
- **Line**: 338
- **Type**: setTimeout

### AuthComponent.svelte:71:setTimeout

- **File**: `/app/client/src/components/AuthComponent.svelte`
- **Line**: 71
- **Type**: setTimeout

### EditorOverlay.svelte:315:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 315
- **Type**: setTimeout

### EditorOverlay.svelte:349:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 349
- **Type**: setTimeout

### OutlinerTree.svelte:236:setInterval

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 236
- **Type**: setInterval

### ProjectSelector.svelte:74:setInterval

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 74
- **Type**: setInterval

### SearchBox.svelte:316:setTimeout

- **File**: `/app/client/src/components/SearchBox.svelte`
- **Line**: 316
- **Type**: setTimeout

### SearchPanel.svelte:227:requestAnimationFrame

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 227
- **Type**: requestAnimationFrame

### connection.ts:142:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 142
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

### yjsService.svelte.ts:301:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 301
- **Type**: setTimeout

### yjsService.svelte.ts:651:setInterval

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 651
- **Type**: setInterval

### +page.svelte:196:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 196
- **Type**: setTimeout

### +page.svelte:274:setInterval

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 274
- **Type**: setInterval

### +page.svelte:486:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 486
- **Type**: setTimeout

### +page.svelte:496:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 496
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

### page.svelte.test.ts:73:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 73
- **Type**: setTimeout

### page.svelte.test.ts:94:setTimeout

- **File**: `/app/client/src/routes/demo/page.svelte.test.ts`
- **Line**: 94
- **Type**: setTimeout

### tableSyncAdapter.test.ts:18:setTimeout

- **File**: `/app/client/src/services/yjstable/tableSyncAdapter.test.ts`
- **Line**: 18
- **Type**: setTimeout

### AliasPickerStore.svelte.ts:52:setTimeout

- **File**: `/app/client/src/stores/AliasPickerStore.svelte.ts`
- **Line**: 52
- **Type**: setTimeout

### CommandPaletteStore.svelte.ts:378:requestAnimationFrame

- **File**: `/app/client/src/stores/CommandPaletteStore.svelte.ts`
- **Line**: 378
- **Type**: requestAnimationFrame

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

### +layout.svelte:131:setInterval

- **File**: `/app/client/src/routes/+layout.svelte`
- **Line**: 131
- **Type**: setInterval
- **Code**: `return setInterval(() => {`

### EditorOverlayStore.svelte.ts:1072:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 1072
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => textarea.focus());`

### EditorOverlayStore.svelte.ts:1073:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 1073
- **Type**: setTimeout
- **Code**: `setTimeout(() => textarea.focus(), 10);`
