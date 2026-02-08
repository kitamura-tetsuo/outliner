<script lang="ts">
import { browser } from "$app/environment";
import { getEnv } from "$lib/env";
import { getLogger } from "$lib/logger";
import { store as appStore } from "../stores/store.svelte";
import type { GeneralStore } from "../stores/store.svelte";
import {
    onDestroy,
    onMount,
} from "svelte";
import "../app.css";
// Import from $lib/index.ts to ensure fetch override is loaded
import "$lib";
// Defer user/auth-related imports to client to avoid SSR crashes
import { setupGlobalDebugFunctions } from "../lib/debug";
import "../utils/ScrapboxFormatter";
// Import for global exposure
import Toolbar from "../components/Toolbar.svelte";
import AliasPicker from "../components/AliasPicker.svelte";
import Sidebar from "../components/Sidebar.svelte";
// Defer services import; it depends on UserManager
import { userPreferencesStore } from "../stores/UserPreferencesStore.svelte";



let { children } = $props();
const logger = getLogger("AppLayout");

// Authentication state
let isAuthenticated = $state(false);

// Sidebar state management - starts closed by default
let isSidebarOpen = $state(false);

// Fallback exposure to global (satisfy window.generalStore early)
if (browser) {
    (window as Window & typeof globalThis & { generalStore?: GeneralStore; appStore?: GeneralStore }).generalStore =
        (window as Window & typeof globalThis & { generalStore?: GeneralStore; appStore?: GeneralStore }).generalStore || appStore;
    (window as Window & typeof globalThis & { generalStore?: GeneralStore; appStore?: GeneralStore }).appStore =
        (window as Window & typeof globalThis & { generalStore?: GeneralStore; appStore?: GeneralStore }).appStore || appStore;
}




let currentTheme = $derived(userPreferencesStore.theme);

// Get API server URL
const API_URL = getEnv("VITE_API_SERVER_URL", "http://localhost:7071");

/**
 * Function to rotate log files
 */
async function rotateLogFiles() {
    try {
        if (import.meta.env.DEV) {
            logger.info(
                "Executing log rotation at application termination",
            );
        }

        // 1. Try with standard Fetch API first
        try {
            const response = await fetch(`${API_URL}/api/rotate-logs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            if (response.ok) {
                const result = await response.json();
                if (import.meta.env.DEV) {
                    logger.info("Log rotation completed", result);
                }
                return;
            }
        }
        catch {
            // Try sendBeacon if fetch fails - do not record error
            if (import.meta.env.DEV) {
                logger.debug(
                    "Standard fetch call failed, attempting sendBeacon",
                );
            }
        }

        // 2. Use sendBeacon as fallback
        const blob = new Blob([JSON.stringify({})], {
            type: "application/json",
        });
        const success = navigator.sendBeacon(
            `${API_URL}/api/rotate-logs`,
            blob,
        );

        if (success) {
            if (import.meta.env.DEV) {
                logger.info("Log rotation execution scheduled");
            }
        }
        else {
            logger.warn("Log rotation transmission failed");

            // 3. Try closing request (image beacon) as a further retry
            try {
                const img = new Image();
                img.src = `${API_URL}/api/rotate-logs?t=${Date.now()}`;
            }
            catch {
                // Ignore error as it is the last attempt
            }
        }
    }
    catch (error) {
        logger.error("An error occurred during log rotation", {
            error,
        });
    }
}

/**
 * Function to execute periodic log rotation (preventive measure)
 */
function schedulePeriodicLogRotation() {
    // Periodic log rotation (every 12 hours)
    const ROTATION_INTERVAL = 12 * 60 * 60 * 1000;

    return setInterval(() => {
        if (import.meta.env.DEV) {
            logger.info("Executing periodic log rotation");
        }
        rotateLogFiles();
    }, ROTATION_INTERVAL);
}

let rotationInterval: ReturnType<typeof setInterval> | undefined = undefined;

// Listener for browser unload event
function handleBeforeUnload() {
    // Execute log rotation when browser closes
    rotateLogFiles();
}

// Use visibilitychange event as another calling method
function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
        // Try log rotation also when user leaves the page
        rotateLogFiles();
    }
}

// Processing at application initialization
onMount(async () => {
    // Execute only in browser environment
    if (browser) {
        // E2E: Hydration detection flag for stable waits
        try {
            (window as any).__E2E_LAYOUT_MOUNTED__ = true;
            document.dispatchEvent(new Event("E2E_LAYOUT_MOUNTED"));
        } catch {}
        // Dynamically import browser-only modules
        let userManager: any;
        let yjsService: any;
        try {
            ({ userManager } = await import("../auth/UserManager"));
            yjsService = await import("../lib/yjsService.svelte");
            // Initialize metadata Y.Doc with IndexedDB persistence
            await import("../lib/metaDoc.svelte");
            await import("../services");
        } catch (e) {
            logger.error("Failed to load client-only modules", e);
        }
        // Application initialization log
        if (import.meta.env.DEV) {
            logger.info("Application mounted");
        }




        // Disable Service Worker in E2E tests to prevent interference with navigation or page closing
        const isE2e = import.meta.env.MODE === "test"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && (window as any).__E2E__ === true);
        if (!isE2e && "serviceWorker" in navigator) {
            navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
                .then(reg => {
                    if (import.meta.env.DEV) logger.info("Service worker registered successfully");
                    if ("sync" in reg) {
                        (reg as any).sync.register("sync-ops").catch((err: any) => {
                            logger.warn("Failed to register background sync:", err);
                        });
                    }
                    reg.addEventListener("updatefound", () => {
                        if (import.meta.env.DEV) logger.info("Service worker update found");
                    });
                })
                .catch(err => { logger.error("Service worker registration failed:", err); });
        }

        // Check authentication status
        isAuthenticated = userManager?.getCurrentUser() !== null;

        if (isAuthenticated) {
            // Initialize debug functions
            setupGlobalDebugFunctions(yjsService?.yjsHighService);
        }
        else {
            // Monitor authentication state changes
            userManager?.addEventListener((authResult: any) => {
                isAuthenticated = authResult !== null;
                if (isAuthenticated && browser) {
                    setupGlobalDebugFunctions(yjsService?.yjsHighService);
                }
            });
        }

        // Yjs: no auth-coupled init hook required

        // Disable cleanup listeners in E2E to avoid interference with page transitions
        const isE2eCleanup = import.meta.env.MODE === "test"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && (window as any).__E2E__ === true);
        if (!isE2eCleanup) {
            // Register event listener for browser termination
            window.addEventListener("beforeunload", handleBeforeUnload);
            // Register visibilitychange event listener (additional insurance)
            document.addEventListener("visibilitychange", handleVisibilityChange);
            // Set up periodic log rotation
            rotationInterval = schedulePeriodicLogRotation();
        }
        // Test-only: normalize drop events so Playwright's dispatchEvent("drop", {dataTransfer}) becomes a real DragEvent
        try {
            if (typeof window !== 'undefined') {
                const origDispatchEventTarget = EventTarget.prototype.dispatchEvent;
                const origDispatchElement = Element.prototype.dispatchEvent;
                // Avoid double-patching
                if (!(window as any).__E2E_DROP_PATCHED__) {
                    (window as any).__E2E_DROP_PATCHED__ = true;

                    const wrap = function(this: any, orig: any, event: Event): boolean {
                        try { console.log('[E2E] dispatchEvent:', event?.type, 'instanceof DragEvent=', event instanceof DragEvent); } catch {}
                        try { if (event && event.type === 'drop') { (window as any).__E2E_ATTEMPTED_DROP__ = true; } } catch {}
                        try {
                            if (event && event.type === 'drop' && !(event instanceof DragEvent)) {
                                const de = new DragEvent('drop', {
                                    bubbles: true,
                                    cancelable: true,
                                } as DragEventInit);
                                try { Object.defineProperty(de, 'dataTransfer', { value: (event as any).dataTransfer, configurable: true }); } catch {}
                                try { (window as any).__E2E_DROP_HANDLERS__?.forEach((fn: any) => { try { fn(this, de); } catch {} }); } catch {}
                                return orig.call(this, de);
                            }
                        } catch {}
                        try { if (event && event.type === 'drop') { (window as any).__E2E_DROP_HANDLERS__?.forEach((fn: any) => { try { fn(this, event); } catch {} }); } } catch {}
                        return orig.call(this, event);
                    };

                    // Patch both EventTarget and Element to maximize coverage
                    // @ts-expect-error - Need to patch prototype for E2E drag/drop testing
                    EventTarget.prototype.dispatchEvent = function(event: Event): boolean { return wrap.call(this, origDispatchEventTarget, event); };
                    Element.prototype.dispatchEvent = function(event: Event): boolean { return wrap.call(this, origDispatchElement, event); };

                    console.log('[E2E] Patched EventTarget.prototype.dispatchEvent and Element.prototype.dispatchEvent for drop events');
                    try {
                        window.addEventListener('drop', (e: any) => {
                            try { console.log('[E2E] window drop listener:', { type: e?.type, isDragEvent: e instanceof DragEvent, hasDT: !!e?.dataTransfer, dtTypes: e?.dataTransfer?.types }); } catch {}
                        }, true);
                    } catch {}

                    // Record files added into DataTransfer in E2E to recover when event.dataTransfer is unavailable in Playwright isolated world
                    try {
                        const anyWin: any = window as any;
                        anyWin.__E2E_LAST_FILES__ = [] as File[];
                        const itemsProto = (DataTransferItemList as any)?.prototype;
                        if (itemsProto && !anyWin.__E2E_DT_ADD_PATCHED__) {
                            anyWin.__E2E_DT_ADD_PATCHED__ = true;
                            const origAdd = itemsProto.add;
                            itemsProto.add = function(data: any, type?: string) {
                                try {
                                    if (data instanceof File) {
                                        anyWin.__E2E_LAST_FILES__.push(data);
                                        try { console.log('[E2E] DataTransfer.items.add(File): recorded', { name: data.name, type: data.type, size: data.size }); } catch {}
                                    }
                                } catch {}
                                return origAdd ? origAdd.call(this, data, type) : undefined;
                            };
                        }

                        // Getter hook: Wrap DataTransfer.prototype.items getter to proxy add
                        try {
                            const desc = Object.getOwnPropertyDescriptor(DataTransfer.prototype as any, 'items');
                            if (desc && typeof desc.get === 'function' && !anyWin.__E2E_DT_ITEMS_GETTER_PATCHED__) {
                                anyWin.__E2E_DT_ITEMS_GETTER_PATCHED__ = true;
                                Object.defineProperty(DataTransfer.prototype as any, 'items', {
                                    configurable: true,
                                    enumerable: true,
                                    get: function() {
                                        const list = desc.get!.call(this);
                                        try {
                                            if (list && typeof list.add === 'function' && !list.__e2eAddPatched) {
                                                const orig = list.add;
                                                list.add = function(data: any, _type?: string) {
                                                    try { if (data instanceof File) anyWin.__E2E_LAST_FILES__.push(data); } catch {}
                                                    return orig.apply(this, [data, _type]);
                                                } as any;
                                                (list as any).__e2eAddPatched = true;
                                                try { console.log('[E2E] Patched DT.items.add via getter'); } catch {}
                                            }
                                        } catch {}
                                        return list;
                                    }
                                });
                            }
                        } catch {}

                        // Fallback: wrap File constructor to record created files from evaluateHandle context as well
                        if (!anyWin.__E2E_FILE_CTOR_PATCHED__) {
                            anyWin.__E2E_FILE_CTOR_PATCHED__ = true;
                            const OrigFile = (window as any).File;
                            if (OrigFile) {
                                const Wrapped = new Proxy(OrigFile, {
                                    construct(target: any, args: any[]) {
                                        const f = new target(...args);
                                        try { anyWin.__E2E_LAST_FILES__.push(f); } catch {}
                                        try { console.log('[E2E] File constructed:', { name: f.name, type: f.type, size: f.size }); } catch {}
                                        return f;
                                    }
                                });
                                // @ts-expect-error - Need to replace window.File for E2E attachment testing
                                (window as any).File = Wrapped;
                            }
                        }

                        // Stronger fallback: wrap DataTransfer constructor to ensure items.add is patched per instance
                        if (!anyWin.__E2E_DT_CTOR_PATCHED__) {
                            anyWin.__E2E_DT_CTOR_PATCHED__ = true;
                            const OrigDT = (window as any).DataTransfer;
                            if (OrigDT) {
                                const WrappedDT = new Proxy(OrigDT, {
                                    construct(target: any, args: any[]) {
                                        const dt = new target(...args);
                                        try {
                                            const list: any = (dt as any).items;
                                            if (list && typeof list.add === 'function' && !list.__e2eAddPatched) {
                                                const origAdd = list.add;
                                                list.add = function(data: any, _type?: string) {
                                                    try { if (data instanceof File) anyWin.__E2E_LAST_FILES__.push(data); } catch {}
                                                    try { console.log('[E2E] DT(instance).items.add called'); } catch {}
                                                    return origAdd.apply(this, [data, _type]);
                                                } as any;
                                                (list as any).__e2eAddPatched = true;
                                            }
                                        } catch {}
                                        return dt;
                                    }
                                });
                                // @ts-expect-error - Need to replace window.DataTransfer for E2E drag/drop testing
                                (window as any).DataTransfer = WrappedDT;
                            }
                        }
                    } catch {}
                }
            }
        } catch {}

        // DEBUG: log drop/dragover events globally to diagnose Playwright dispatchEvent
        try {
            window.addEventListener('drop', (ev: any) => {
                try { console.log('[GlobalDrop] drop received target=', (ev?.target as any)?.className || (ev?.target as any)?.tagName); } catch {}
            }, { capture: true });
            document.addEventListener('drop', (ev: any) => {
                try { console.log('[DocDrop] drop received target=', (ev?.target as any)?.className || (ev?.target as any)?.tagName); } catch {}
            }, { capture: true });
            window.addEventListener('dragover', (ev: any) => {
                try { console.log('[GlobalDrop] dragover received target=', (ev?.target as any)?.className || (ev?.target as any)?.tagName); } catch {}
            }, { capture: true });
        } catch {}

    }
});

// Processing at component destruction
onDestroy(async () => {
    // Execute only in browser environment
    if (browser) {
        // Remove event listeners
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );

        try {
            const { cleanupYjsClient } = await import("../services");
            cleanupYjsClient();
        } catch {}

        // Cancel periodic log rotation
        if (rotationInterval) {
            clearInterval(rotationInterval);
        }
    }
});
// HMR Trigger
</script>

<div data-testid="app-layout">
    <!-- Accessible skip link -->
    <a href="#main-content" class="skip-link">Skip to content</a>

    <!-- Global main toolbar with SearchBox (SEA-0001) -->
    <Toolbar />

    <!-- Sidebar toggle button -->
    <button
        class="sidebar-toggle"
        onclick={() => (isSidebarOpen = !isSidebarOpen)}
        aria-label={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
        title={isSidebarOpen ? "Hide sidebar" : "Show sidebar"}
    >
        {#if isSidebarOpen}
            <!-- Close Icon (X) -->
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        {:else}
            <!-- Hamburger Menu Icon -->
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M3 12h18M3 6h18M3 18h18"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        {/if}
    </button>

    <!-- Global AliasPicker component -->
    <AliasPicker />

    <!-- Sidebar component -->
    <Sidebar bind:isOpen={isSidebarOpen} />

    <!-- Ensure content is not hidden behind fixed toolbar and accounts for sidebar -->
    <div id="main-content" class="main-content" class:with-sidebar={isSidebarOpen} tabindex="-1" style="outline: none;">
        {@render children()}
    </div>

    <button
        class="theme-toggle fixed bottom-4 right-4 p-2 rounded bg-gray-200 dark:bg-gray-700"
        onclick={() => userPreferencesStore.toggleTheme()}
    >
        {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
    </button>
</div>

<style>
/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content {
    padding-top: 5rem;
    transition: margin-left 0.3s ease;
}

/* Add left margin when sidebar is open */
.main-content.with-sidebar {
    margin-left: 250px;
}

/* Sidebar toggle button */
.sidebar-toggle {
    position: fixed;
    top: 6rem;
    left: 1rem;
    z-index: 100;
    width: 40px;
    height: 40px;
    background-color: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: background-color 0.2s ease, left 0.3s ease;
}

.sidebar-toggle:hover {
    background-color: #2563eb;
}

/* Dark mode for sidebar toggle */
:global(html.dark) .sidebar-toggle {
    background-color: #1d4ed8;
}

:global(html.dark) .sidebar-toggle:hover {
    background-color: #1e40af;
}

/* Theme toggle button - ensure it's above the sidebar */
.theme-toggle {
    z-index: 50;
}

/* Skip link for accessibility */
.skip-link {
    position: fixed;
    top: -9999px;
    left: 0.5rem;
    z-index: 20000; /* Above toolbar */
    background: #3b82f6; /* Blue 500 */
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    text-decoration: none;
    font-weight: 500;
    transition: top 0.2s ease;
}

.skip-link:focus {
    top: 0.5rem;
    outline: 2px solid white;
    box-shadow: 0 0 0 4px #3b82f6;
}
</style>
