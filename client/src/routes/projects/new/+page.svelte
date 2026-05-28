<script lang="ts">
import { goto } from "$app/navigation";
import {
    onDestroy,
    onMount,
} from "svelte";
import {
    userManager,
} from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import * as yjsHighService from "../../../lib/yjsService.svelte";
import { getLogger } from "../../../lib/logger";
import { yjsStore } from "../../../stores/yjsStore.svelte";
import { v4 as uuidv4 } from "uuid";
const logger = getLogger();

let isLoading = $state(false);
let error: string | undefined = $state(undefined);
let success: string | undefined = $state(undefined);
let containerName = $state("");
let isAuthenticated = $state(false);
let createdContainerId: string | undefined = $state(undefined);

// Handle successful authentication
async function handleAuthSuccess(authResult) {
    logger.info("Authentication success:", authResult);
    isAuthenticated = true;
}

// Handle logout
function handleAuthLogout() {
    logger.info("Logged out");
    isAuthenticated = false;
}

// Create a new container
async function createNewContainer() {
    if (!containerName.trim()) {
        error = "Please enter an outliner name";
        return;
    }

    isLoading = true;
    error = undefined;
    success = undefined;

    try {
        // Dispose and reset the current client
        const client = yjsStore.yjsClient as any;
        if (client) {
            client.dispose?.();
            yjsStore.yjsClient = undefined;
        }

        // 1. Generate ID first
        const newProjectId = uuidv4();
        createdContainerId = newProjectId; // UI update immediately

        // 2. Register to server and connect WebSocket via createNewProject
        // (saveProjectIdToServer retry logic runs internally)
        logger.info(`Creating new project ${containerName} (ID: ${newProjectId})...`);
        const newClient = await yjsHighService.createNewProject(containerName, newProjectId);

        // Update the store
        yjsStore.yjsClient = newClient as any;

        success = `New outliner created! (ID: ${createdContainerId})`;

        // Navigate to the created project page after 1.5 seconds
        setTimeout(() => {
            goto("/" + containerName);
        }, 1500);
    }
    catch (err) {
        logger.error("Error creating new outliner:", err);
        error = err instanceof Error
            ? err.message
            : "An error occurred while creating the new outliner.";
    }
    finally {
        isLoading = false;
    }
}

onMount(() => {
    // Check UserManager authentication status

    isAuthenticated = userManager.getCurrentUser() !== null;
});

onDestroy(() => {
    // Cleanup code if necessary
});
</script>

<svelte:head>
    <title>Create New Outliner - Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <h1 class="mb-6 text-center text-3xl font-bold">
        Create New Outliner
    </h1>

    <div class="auth-section mb-8">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isAuthenticated}
        <div class="mx-auto max-w-md rounded-lg bg-white p-6 shadow-md">
            <h2 class="mb-4 text-xl font-semibold">
                Create a New Outliner
            </h2>

            <div class="mb-4">
                <label
                    for="containerName"
                    class="mb-1 block text-sm font-medium text-gray-700"
                >
                    Outliner Name
                </label>
                <input
                    type="text"
                    id="containerName"
                    bind:value={containerName}
                    placeholder="My Outliner"
                    class="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {#if error}
                <div
                    class="mb-4 rounded-md bg-red-100 p-3 text-red-700"
                    role="alert"
                >
                    {error}
                </div>
            {/if}

            {#if success}
                <div
                    class="mb-4 rounded-md bg-green-100 p-3 text-green-700"
                    role="alert"
                >
                    {success}
                </div>
            {/if}

            <button
                onclick={createNewContainer}
                disabled={isLoading}
                class="
                    w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {isLoading
                    ? 'cursor-not-allowed opacity-70'
                    : ''}
                "
            >
                {#if isLoading}
                    <span class="mr-2 inline-block animate-spin">⏳</span> Creating...
                {:else}
                    Create
                {/if}
            </button>

            {#if createdContainerId}
                <div class="mt-4 rounded-md bg-gray-100 p-3">
                    <p class="text-sm text-gray-700">
                        Created Container ID: <code class="rounded bg-gray-200 px-1 py-0.5">{createdContainerId}</code>
                    </p>
                </div>
            {/if}
        </div>
    {:else}
        <div class="mx-auto max-w-md rounded-lg bg-yellow-50 p-6 shadow-md">
            <h2 class="mb-2 text-xl font-semibold">Authentication Required</h2>
            <p class="mb-4 text-gray-700">
                To create a new outliner, please log in using the button above.
            </p>
        </div>
    {/if}

    <div class="mt-6 text-center">
        <a
            href="/"
            class="rounded-md px-2 py-1 text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            Back to Home
        </a>
    </div>
</main>

<style>
/* Add styling if necessary */
</style>
