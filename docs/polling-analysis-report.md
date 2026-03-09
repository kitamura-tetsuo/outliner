# Polling Analysis Report

Generated at: 2026-03-09T10:25:49.411Z

## Overview

- Total Polling Count: 132
- Necessary Polling: 3
- Suspicious Polling: 102
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

### EditorOverlay.svelte:639:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 639
- **Type**: setTimeout
- **Code**: `updatePositionMapTimer = setTimeout(() => {`

**Context**:
```
let updatePositionMapTimer: number;

// Update position map with debounce
function debouncedUpdatePositionMap() {
    clearTimeout(updatePositionMapTimer);
    updatePositionMapTimer = setTimeout(() => {
        if (!aliasPickerStore.isVisible) updatePositionMap();
    }, 100) as unknown as number;
}

// Data reflection from store is guaranteed by MutationObserver and onMount initialization
```

### EditorOverlay.svelte:712:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 712
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

### EditorOverlay.svelte:1326:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 1326
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

        // Additional attempts to ensure focus
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
        // Multiple attempts to ensure focus is set
        setTimeout(() => {
            if (textareaRef && !aliasPickerStore.isVisible) {
                textareaRef.focus();

                // Debug information
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

### OutlinerItem.svelte:795:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 795
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => {`

**Context**:
```
        "OutlinerItem startEditing: Focus set to global textarea, activeElement:",
        document.activeElement === textareaEl,
    );

    // Additional attempts to ensure focus
    requestAnimationFrame(() => {
        textareaEl.focus();

        setTimeout(() => {
            textareaEl.focus();

```

### OutlinerItem.svelte:798:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 798
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

### OutlinerItem.svelte:1065:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1065
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

### OutlinerItem.svelte:1069:setTimeout

- **File**: `/app/client/src/components/OutlinerItem.svelte`
- **Line**: 1069
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

                    // Check if focus was set
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

// Temporary fallback: poll lastConfirmed
let aliasLastConfirmedPulse: { itemId: string; targetId: string; at: number } | null = $state(null);

onMount(() => {
    const iv = setInterval(() => {
        try {
            const ap: any = (typeof window !== 'undefined') ? (window as any).aliasPickerStore : null;
            const li = ap?.lastConfirmedItemId;
            const lt = ap?.lastConfirmedTargetId;
            const la = ap?.lastConfirmedAt as number | null;
```

### OutlinerTree.svelte:67:requestAnimationFrame

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 67
- **Type**: requestAnimationFrame
- **Code**: `scrollTimeout = requestAnimationFrame(() => {`

**Context**:
```
    // Throttle scroll event to improve performance
    let scrollTimeout: number | null = null;
    function handleScroll() {
        if (scrollTimeout) return;

        scrollTimeout = requestAnimationFrame(() => {
            if (typeof window !== "undefined") {
                showScrollTop = window.scrollY > 300;
            }
            scrollTimeout = null;
        });
```

### OutlinerTree.svelte:728:setTimeout

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 728
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

### ProjectSelector.svelte:161:setTimeout

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 161
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:
```
                    "password",
                );
                logger.info("ProjectSelector - Login successful");

                // After successful login, wait a bit and check Firestore sync
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

### Cursor.ts:146:requestAnimationFrame

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 146
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

                    // Ensure the current item is visible in the viewport
                    if (typeof document !== "undefined" && this.itemId) {
                        try {
```

### Cursor.ts:169:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 169
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:
```
                            console.warn("Failed to scroll cursor item into view:", e);
                        }
                    }

                    // Use setTimeout as well for extra reliability
                    setTimeout(() => {
                        textarea.focus();

                        // Debug information
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
```

### Cursor.ts:830:setTimeout

- **File**: `/app/client/src/lib/Cursor.ts`
- **Line**: 830
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

### KeyEventHandler.ts:651:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 651
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
                            const w: any = typeof window !== "undefined" ? (window as any) : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
```

### KeyEventHandler.ts:670:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 670
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

### KeyEventHandler.ts:719:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 719
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

### KeyEventHandler.ts:727:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 727
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
                            const w: any = typeof window !== "undefined" ? (window as any) : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
```

### KeyEventHandler.ts:744:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 744
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

### KeyEventHandler.ts:895:requestAnimationFrame

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 895
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

### KeyEventHandler.ts:899:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 899
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

### KeyEventHandler.ts:1186:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1186
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

### KeyEventHandler.ts:1318:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1318
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

### KeyEventHandler.ts:1320:setTimeout

- **File**: `/app/client/src/lib/KeyEventHandler.ts`
- **Line**: 1320
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

### CursorEditor.ts:601:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorEditor.ts`
- **Line**: 601
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

### CursorSelection.ts:495:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 495
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
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

```

### CursorSelection.ts:763:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 763
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
                if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                    console.log(`Selection elements in DOM: ${selectionElements.length}`);
                }

```

### CursorSelection.ts:786:setTimeout

- **File**: `/app/client/src/lib/cursor/CursorSelection.ts`
- **Line**: 786
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
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(`Selection still not visible after 100ms, forcing update again`);
                    }
```

### linkPreviewHandler.ts:235:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 235
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

### linkPreviewHandler.ts:287:setTimeout

- **File**: `/app/client/src/lib/linkPreviewHandler.ts`
- **Line**: 287
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

//     // Can also lock with arbitrary keys
```

### lock.ts:102:setTimeout

- **File**: `/app/client/src/lib/lock.ts`
- **Line**: 102
- **Type**: setTimeout
- **Code**: `//         await new Promise(r => setTimeout(r, 700));`

**Context**:
```
//     service.methodB();

//     // Locking with an arbitrary key
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

### pollingMonitor.ts:83:setInterval

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 83
- **Type**: setInterval
- **Code**: `console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);`

**Context**:
```
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                    // Return a dummy ID
                    return id;
                }

                const callbackFn: (...cbArgs: unknown[]) => unknown = typeof callback === "function"
```

### pollingMonitor.ts:126:setTimeout

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 126
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

### pollingMonitor.ts:169:requestAnimationFrame

- **File**: `/app/client/src/lib/pollingMonitor.ts`
- **Line**: 169
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

### connection.ts:258:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 258
- **Type**: setTimeout
- **Code**: `const timer = setTimeout(() => {`

**Context**:
```
            console.log(`[createProjectConnection] Initial tree.size=${treeSize}`);
            resolve();
            return;
        }

        const timer = setTimeout(() => {
            console.warn(
                `[createProjectConnection] Timeout (30s) waiting for project initial sync, proceeding anyway for room: ${room}`,
            );
            const treeSize = (doc.getMap("orderedTree") as Y.Map<any>).size;
            console.log(`[createProjectConnection] Timeout tree.size=${treeSize}`);
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

### testHelpers.ts:202:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 202
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

### testHelpers.ts:208:setTimeout

- **File**: `/app/client/src/lib/yjs/testHelpers.ts`
- **Line**: 208
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

### yjsService.svelte.ts:173:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 173
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 500));`

**Context**:
```
                const saved = await saveProjectIdToServer(projectId, projectName);
                if (saved) {
                    console.log(`[yjsService] Project ID saved successfully on attempt ${attempt}.`);
                    registrationSuccess = true;
                    // Wait for Firestore propagation (important for subsequent reads)
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                } else {
                    console.warn(`[yjsService] saveProjectIdToServer returned false on attempt ${attempt}.`);
                }
            } catch (saveError) {
```

### yjsService.svelte.ts:184:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 184
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 1000 * attempt));`

**Context**:
```
                console.error(`[yjsService] Exception saving project ID (attempt ${attempt}):`, saveError);
            }

            // Wait before retry
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        if (!registrationSuccess) {
            console.error(
```

### yjsService.svelte.ts:285:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 285
- **Type**: setTimeout
- **Code**: `setTimeout(check, 50);`

**Context**:
```
                        new Error(
                            "Timeout waiting for project data from the server. Please check your network connection and reload the page.",
                        ),
                    );
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
        console.log(`[getClientByProjectTitle] firestoreStore wait finished. isLoaded=${firestoreStore.isLoaded}`);
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

        // Defer to event loop to avoid reactivity depth issues
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }

    // Handle auth success
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

### +page.svelte:412:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 412
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

### +page.svelte:478:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 478
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

### +page.svelte:425:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 425
- **Type**: setTimeout
- **Code**: `await new Promise(resolve => setTimeout(resolve, 100));`

**Context**:
```
                        if (itemCount > 0) {
                            console.log("Schedule page: Page items found", { pageId, itemCount });
                            break;
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (e) {
            console.warn("Schedule page: Error waiting for page items:", e);
        }
```

### +page.svelte:566:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 566
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

        // Update connection status periodically (every 5 seconds)
        statusInterval = setInterval(() => {
            updateConnectionStatus();
        }, 5000);
    }
    catch (err) {
        console.error("Error initializing debug page:", err);
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
            success = "Selected projects have been deleted";
            // Reload the page after a short delay to update the project list after deletion
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }

        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Reassignment to trigger Svelte reactivity, not creating new reactive state
```

### +page.svelte:70:setTimeout

- **File**: `/app/client/src/routes/projects/new/+page.svelte`
- **Line**: 70
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:
```
        yjsStore.yjsClient = newClient as any;

        success = `New outliner created! (ID: ${createdContainerId})`;

        // Navigate to the created project page after 1.5 seconds
        setTimeout(() => {
            goto("/" + containerName);
        }, 1500);
    }
    catch (err) {
        logger.error("Error creating new outliner:", err);
```

### +page.svelte:84:setInterval

- **File**: `/app/client/src/routes/settings/[project]/+page.svelte`
- **Line**: 84
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
                       goto(`/settings/${encodeURIComponent(newTitle)}`, { replaceState: true });
                   }
```

### +page.svelte:93:setTimeout

- **File**: `/app/client/src/routes/settings/[project]/+page.svelte`
- **Line**: 93
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:
```
                       goto(`/settings/${encodeURIComponent(newTitle)}`, { replaceState: true });
                   }
                }, 100);

                // Safety timeout
                setTimeout(() => {
                    clearInterval(checkInterval);
                    // Fallback redirect
                    goto(`/settings/${encodeURIComponent(newTitle)}`, { replaceState: true });
                }, 5000);

```

### +page.svelte:52:setTimeout

- **File**: `/app/client/src/routes/share/[token]/+page.svelte`
- **Line**: 52
- **Type**: setTimeout
- **Code**: `setTimeout(() => {`

**Context**:
```
            }

            const data = await res.json();
            status = "success";
            message = "Successfully joined! Redirecting to project...";
            setTimeout(() => {
                goto(`/${data.projectId}`);
            }, 1500);
        } catch (e: any) {
            status = "error";
            message = e.message;
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

### EditorOverlayStore.svelte.ts:226:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 226
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

### EditorOverlayStore.svelte.ts:230:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 230
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
                        if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                            console.log(
```

### EditorOverlayStore.svelte.ts:279:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 279
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

### EditorOverlayStore.svelte.ts:283:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 283
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
                    if (typeof window !== "undefined" && (window as any).DEBUG_MODE) {
                        console.log(
```

### EditorOverlayStore.svelte.ts:429:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 429
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
                // Create a new object and replace it so Svelte can detect the change
                this.selections = {
                    ...this.selections,
```

### EditorOverlayStore.svelte.ts:540:setInterval

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 540
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

### EditorOverlayStore.svelte.ts:696:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 696
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

### EditorOverlayStore.svelte.ts:704:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 704
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
        // HTML should be rendered in the diff area
        const diffs = document.querySelectorAll(".diff-view");
        expect(diffs.length).toBeGreaterThan(0);

        // Wait for reactivity
        await new Promise(r => setTimeout(r, 100));

        let htmlContent = "";
        diffs.forEach(diff => htmlContent += diff.innerHTML);

        expect(htmlContent).toContain("ins");
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:19:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 19
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

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:21:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 21
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

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:53:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 53
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 100));`

**Context**:
```
                }
            }
        }

        // Wait for the manual sync to take effect
        await new Promise(r => setTimeout(r, 100));

        const states = c2.awareness!.getStates() as Map<number, AwarenessState>;
        console.log("States size:", states.size);
        console.log("States values:", Array.from(states.values()));
        const received = Array.from(states.values()).some(s => (s as any).presence?.cursor?.itemId === "root");
```

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:64:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 64
- **Type**: setTimeout
- **Code**: `await new Promise(r => setTimeout(r, 0));`

**Context**:
```
        console.log("Received:", received);
        expect(received).toBe(true);

        c1.dispose();
        c2.dispose();
        await new Promise(r => setTimeout(r, 0));
    });
});

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

### AuthComponent.svelte:72:setTimeout

- **File**: `/app/client/src/components/AuthComponent.svelte`
- **Line**: 72
- **Type**: setTimeout

### CommentThread.svelte:186:setInterval

- **File**: `/app/client/src/components/CommentThread.svelte`
- **Line**: 186
- **Type**: setInterval

### EditorOverlay.svelte:234:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 234
- **Type**: setTimeout

### EditorOverlay.svelte:268:setTimeout

- **File**: `/app/client/src/components/EditorOverlay.svelte`
- **Line**: 268
- **Type**: setTimeout

### OutlinerTree.svelte:163:setInterval

- **File**: `/app/client/src/components/OutlinerTree.svelte`
- **Line**: 163
- **Type**: setInterval

### ProjectSelector.svelte:72:setInterval

- **File**: `/app/client/src/components/ProjectSelector.svelte`
- **Line**: 72
- **Type**: setInterval

### SearchPanel.svelte:43:setInterval

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 43
- **Type**: setInterval

### SearchPanel.svelte:399:requestAnimationFrame

- **File**: `/app/client/src/components/SearchPanel.svelte`
- **Line**: 399
- **Type**: requestAnimationFrame

### connection.ts:138:setTimeout

- **File**: `/app/client/src/lib/yjs/connection.ts`
- **Line**: 138
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

### yjsService.svelte.ts:241:setTimeout

- **File**: `/app/client/src/lib/yjsService.svelte.ts`
- **Line**: 241
- **Type**: setTimeout

### +page.svelte:264:setInterval

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 264
- **Type**: setInterval

### +page.svelte:459:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/+page.svelte`
- **Line**: 459
- **Type**: setTimeout

### +page.svelte:467:setTimeout

- **File**: `/app/client/src/routes/[project]/[page]/schedule/+page.svelte`
- **Line**: 467
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

### prs-cursor-sync-4d2e1b6a.integration.spec.ts:30:setTimeout

- **File**: `/app/client/src/tests/integration/yjs/prs-cursor-sync-4d2e1b6a.integration.spec.ts`
- **Line**: 30
- **Type**: setTimeout

## Necessary Polling

These are pollings with clear purposes and should not be removed.

### +layout.svelte:130:setInterval

- **File**: `/app/client/src/routes/+layout.svelte`
- **Line**: 130
- **Type**: setInterval
- **Code**: `return setInterval(() => {`

### EditorOverlayStore.svelte.ts:831:requestAnimationFrame

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 831
- **Type**: requestAnimationFrame
- **Code**: `requestAnimationFrame(() => textarea.focus());`

### EditorOverlayStore.svelte.ts:832:setTimeout

- **File**: `/app/client/src/stores/EditorOverlayStore.svelte.ts`
- **Line**: 832
- **Type**: setTimeout
- **Code**: `setTimeout(() => textarea.focus(), 10);`
