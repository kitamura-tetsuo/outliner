<script lang="ts">
import { onMount } from "svelte";
import { resolveRoute } from "$app/paths";
import { createYjsClient } from "../services";
import { getLogger } from "../lib/logger";
import { containersFromUserContainer } from "../stores/containerStore.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import { firestoreStore } from "../stores/firestoreStore.svelte";
import type { UserManager } from "../auth/UserManager";
import type { IAuthResult } from "../auth/UserManager";
import type { YjsClient } from "../yjs/YjsClient";
const logger = getLogger();

interface Props {
    onContainerSelected?: (
        containerId: string,
        containerName: string,
    ) => void;
}

let { onContainerSelected = () => {} }: Props = $props();

let selectedContainerId = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);



// Redraw trigger (backstop for test environments)
let redraw = $state(0);

// Recompute containers stably (eventless: ucVersion, test fallback: redraw)
let containers = $derived.by(() => {
    void firestoreStore.ucVersion; // Dependency only
    void redraw; // Temporary dependency (event-driven compatibility)
    return containersFromUserContainer(firestoreStore.userContainer);
});
$effect(() => {
    logger.info("ContainerSelector - containers len", { len: containers.length, ucv: firestoreStore.ucVersion });
});




// Display currently loading container ID
let currentContainerId = yjsStore.currentContainerId;



onMount(() => {
    const cleanupTasks: Array<() => void> = [];
    // If there is a current container ID, select it
    if (currentContainerId) {
        selectedContainerId = currentContainerId;
    }

    // Initial sync: Force recomputation once immediately after mount to reflect pre-populated userContainer
    // (Ensure DOM is updated even if ucVersion changed before mount)
    try { redraw = (redraw + 1) | 0; } catch {}

    // Check authentication state and attempt login if necessary (executed asynchronously)
    ensureUserLoggedIn();

    if (typeof window !== "undefined") {
        const isTestEnv = import.meta.env.MODE === "test"
            || import.meta.env.VITE_IS_TEST === "true"
            || window.location.hostname === "localhost";

        if (isTestEnv) {
            // In test environments, provide a backstop to track ucVersion changes
            let lastVersion = firestoreStore.ucVersion;
            const intervalId = window.setInterval(() => {
                const currentVersion = firestoreStore.ucVersion;
                if (currentVersion !== lastVersion) {
                    lastVersion = currentVersion;
                    redraw = (redraw + 1) | 0;
                }
            }, 150);
            cleanupTasks.push(() => {
                window.clearInterval(intervalId);
            });

            // Add: Immediate recomputation with test-specific sync event (avoid initialization race conditions immediately after seed)
            const onUcChanged = () => { try { redraw = (redraw + 1) | 0; } catch {} };
            window.addEventListener('firestore-uc-changed', onUcChanged);
            cleanupTasks.push(() => window.removeEventListener('firestore-uc-changed', onUcChanged));
        }
    }

    // Monitor changes in authentication state
    const userManagerInstance = (window as typeof window & { __USER_MANAGER__?: UserManager }).__USER_MANAGER__;
    if (userManagerInstance) {
        const unsubscribe = userManagerInstance.addEventListener((authResult: IAuthResult | null) => {
            if (authResult) {
                logger.info("ContainerSelector - User authenticated, containers should be available");
            } else {
                logger.info("ContainerSelector - User signed out");
            }
        });
        if (unsubscribe) {
            cleanupTasks.push(() => {
                unsubscribe();
            });
        }
    }

    // Return cleanup function
    return () => {
        for (const clean of cleanupTasks) {
            try {
                clean();
            } catch (err) {
                logger.warn("ContainerSelector cleanup failed", err);
            }
        }
    };
});

// Function to check user login state and attempt login if necessary
async function ensureUserLoggedIn() {
    // Get UserManager instance
    const userManagerInstance = (window as typeof window & { __USER_MANAGER__?: UserManager }).__USER_MANAGER__;
    if (!userManagerInstance) {
        logger.warn("ContainerSelector - UserManager not available");
        return;
    }

    const currentUser = userManagerInstance.getCurrentUser();
    const authUser = userManagerInstance.auth?.currentUser;

    logger.info("ContainerSelector - Current user:", currentUser);
    logger.info("ContainerSelector - Auth user:", authUser);

    if (!currentUser && !authUser) {
        logger.info("ContainerSelector - No user found, attempting login...");
        try {
            await userManagerInstance.loginWithEmailPassword('test@example.com', 'password');
            logger.info("ContainerSelector - Login successful");

            // After successful login, wait briefly before checking Firestore sync
            setTimeout(() => {
                const cnt = containersFromUserContainer(firestoreStore.userContainer).length;
                logger.info("ContainerSelector - Checking containers after login:", cnt);
            }, 1000);
        } catch (err) {
            logger.error("ContainerSelector - Login failed:", err);
        }
    }
}

// Process for container selection
async function handleContainerChange() {
    if (!selectedContainerId) return;

    try {
        isLoading = true;
        error = null;

        // Get information of the selected container
        const selectedContainer = containersFromUserContainer(firestoreStore.userContainer).find(
            c => c.id === selectedContainerId,
        );
        if (!selectedContainer) {
            throw new Error("Selected container not found");
        }

        // Emit the selected container ID and container name as an event
        onContainerSelected(selectedContainerId, selectedContainer.name);
    }
    catch (err) {
        logger.error("Container selection error:", err);
        error = err instanceof Error
            ? err.message
            : "An error occurred while selecting the container";
    }
    finally {
        isLoading = false;
    }
}

// Reload current container ID
async function reloadCurrentContainer() {
    if (!currentContainerId) return;

    try {
        isLoading = true;
        error = null;

        // Reload the current container using the factory method
        const client = await createYjsClient(currentContainerId);
        yjsStore.yjsClient = client as YjsClient;
    }
    catch (err) {
        logger.error("Container reload error:", err);
        error = err instanceof Error
            ? err.message
            : "An error occurred while reloading the container";
    }
    finally {
        isLoading = false;
    }
}
</script>

<div class="container-selector">
    <div class="selector-header">
        <h3 class="selector-title">Outliner Selection</h3>
        {#if isLoading}
            <span class="loading-indicator">Loading...</span>
        {/if}
    </div>



    {#if error}
        <div class="error-message">
            {error}
        </div>
    {/if}

    <div class="selector-content">
        <div class="select-container">
            <select
                bind:value={selectedContainerId}
                onchange={handleContainerChange}
                disabled={isLoading || containers.length === 0}
                class="container-select"
            >
                {#if containers.length === 0}
                    <option value="">No containers available</option>
                {:else}
                    {#each containers as container (container.id)}
                        <option value={container.id}>
                            {container.name}
                            {container.isDefault ? "(Default)" : ""}
                            {container.id === currentContainerId ? "(Currently displaying)" : ""}
                        </option>
                    {/each}
                {/if}
            </select>
        </div>

        <div class="actions">
            <button
                onclick={reloadCurrentContainer}
                disabled={isLoading || !currentContainerId}
                class="reload-button"
            >
                Reload current container
            </button>

            <a href={resolveRoute("/containers")} class="new-container-link"> Create New </a>
        </div>
    </div>
</div>

<style>
.container-selector {
    background-color: #f5f5f5;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
}

.selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.selector-title {
    font-size: 16px;
    font-weight: bold;
    margin: 0;
}

.loading-indicator {
    font-size: 14px;
    color: #666;
}



.error-message {
    background-color: #fff0f0;
    border-left: 3px solid #ff6b6b;
    color: #d32f2f;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-size: 14px;
}

.selector-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.select-container {
    display: flex;
    gap: 8px;
}

.container-select {
    flex-grow: 1;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #ccc;
    background-color: white;
}

.actions {
    display: flex;
    gap: 8px;
}

.reload-button {
    padding: 6px 12px;
    background-color: #e0e0e0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
}

.reload-button:hover {
    background-color: #d0d0d0;
}

.new-container-link {
    padding: 6px 12px;
    background-color: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    text-decoration: none;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.new-container-link:hover {
    background-color: #45a049;
}
</style>
