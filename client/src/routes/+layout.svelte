<script lang="ts">
import { browser } from "$app/environment";
import SvelteSEO from "svelte-seo";
import { getLogger } from "$lib/logger";
import { store as appStore } from "../stores/store.svelte";

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
import DatabaseSidebar from "../components/DatabaseSidebar.svelte";
// Defer services import; it depends on UserManager
// Removed unused import: userPreferencesStore



let { children } = $props();
const logger = getLogger("AppLayout");

// Authentication state
let isAuthenticated = $state(false);

// Sidebar state management - starts closed by default
let isSidebarOpen = $state(false);
let isDatabaseSidebarOpen = $state(false);

// Fallback exposure to global (satisfy window.generalStore early)
if (browser) {
    window.generalStore =
        window.generalStore || appStore;
    window.appStore =
        window.appStore || appStore;
}




// Removed unused derived state: currentTheme



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
            const response = await fetch(`/api/rotate-logs`, {
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
            `/api/rotate-logs`,
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
                img.src = `/api/rotate-logs?t=${Date.now()}`;
            }
            catch {
                // Ignore error as it is the last attempt
            }
        }
    }
    catch (error) {
        logger.error({ error: error as Error }, "An error occurred during log rotation");
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
            window.__E2E_LAYOUT_MOUNTED__ = true;
            document.dispatchEvent(new Event("E2E_LAYOUT_MOUNTED"));
        } catch {}
        // Dynamically import browser-only modules
        let userManager: { addEventListener: (f: (e: unknown) => void) => void } | undefined;
        try {
            ({ userManager } = await import("../auth/UserManager"));
            // Initialize metadata Y.Doc with IndexedDB persistence
            await import("../lib/metaDoc.svelte");
            await import("../services");
        } catch (e) {
            logger.error({ error: e as Error }, "Failed to load client-only modules");
        }
        // Application initialization log
        if (import.meta.env.DEV) {
            logger.info("Application mounted");
        }




        // Disable Service Worker in E2E tests to prevent interference with navigation or page closing
        const isE2e = import.meta.env.MODE === "test"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && window.__E2E__ === true);
        if (!isE2e && !import.meta.env.DEV && "serviceWorker" in navigator) {
            navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
                .then(reg => {
                    if (import.meta.env.DEV) logger.info("Service worker registered successfully");
                    reg.addEventListener("updatefound", () => {
                        if (import.meta.env.DEV) logger.info("Service worker update found");
                    });
                })
                .catch(err => { logger.error({ error: err as Error }, "Service worker registration failed:"); });
        }

        // Check authentication status
                const userManagerWithGetCurrentUser = userManager as unknown as { getCurrentUser?: () => unknown };
        isAuthenticated = userManagerWithGetCurrentUser?.getCurrentUser?.() !== null;

        if (isAuthenticated) {
            // Initialize debug functions
            setupGlobalDebugFunctions();
        }
        else {
            // Monitor authentication state changes
            userManager?.addEventListener((authResult: unknown) => {
                isAuthenticated = authResult !== null;
                if (isAuthenticated && browser) {
                    setupGlobalDebugFunctions();
                }
            });
        }

        // Yjs: no auth-coupled init hook required

        // Disable cleanup listeners in E2E to avoid interference with page transitions
        const isE2eCleanup = import.meta.env.MODE === "test"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && window.__E2E__ === true);
        if (!isE2eCleanup) {
            // Register event listener for browser termination
            window.addEventListener("beforeunload", handleBeforeUnload);
            // Register visibilitychange event listener (additional insurance)
            document.addEventListener("visibilitychange", handleVisibilityChange);
            // Set up periodic log rotation
            rotationInterval = schedulePeriodicLogRotation();
        }



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

<SvelteSEO
    title="Outliner"
    description="A hierarchical outliner application."
    openGraph={{
        description: "A hierarchical outliner application.",
        images: [
            {
                url: "/favicon.png",
                alt: "Outliner logo"
            }
        ]
    }}
    twitter={{
        description: "A hierarchical outliner application.",
        image: "/favicon.png"
    }}
/>

<div data-testid="app-layout">
    <!-- Accessible skip link -->
    <a href="#main-content" class="skip-link text-[41px] text-[42px] text-3xl">Skip to content</a>

    <!-- Global main toolbar with SearchBox (SEA-0001) -->
    <Toolbar onToggleDatabaseSidebar={() => isDatabaseSidebarOpen = !isDatabaseSidebarOpen} />

    <!-- Sidebar toggle button -->
    <button type="button"
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

    <!-- Database Sidebar component -->
    <DatabaseSidebar bind:isOpen={isDatabaseSidebarOpen} />

    <!-- Ensure content is not hidden behind fixed toolbar and accounts for sidebar -->
    <div id="main-content" class="main-content" class:with-sidebar={isSidebarOpen} class:with-database-sidebar={isDatabaseSidebarOpen} tabindex="-1" style="outline: none;">
        {@render children()}
    </div>
</div>

<style>
/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content {
    padding-top: 5rem;
    transition: margin-left 0.3s ease, width 0.3s ease;
    width: 100%;
    box-sizing: border-box;
}

/* Add right margin when database sidebar is open */
.main-content.with-database-sidebar {
    margin-right: 250px;
    width: calc(100% - 250px);
    box-sizing: border-box;
}

.main-content.with-sidebar.with-database-sidebar {
    width: calc(100% - 500px);
    box-sizing: border-box;
}

/* Add left margin when sidebar is open */
.main-content.with-sidebar {
    margin-left: 250px;
    width: calc(100% - 250px);
    box-sizing: border-box;
}

/* Sidebar toggle button */
.sidebar-toggle {
    position: fixed;
    top: 0.75rem;
    left: 1rem;
    z-index: 10001;
    width: 2.5rem;
    height: 2.5rem;
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
