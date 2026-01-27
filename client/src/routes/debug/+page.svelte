<script lang="ts">
import { browser } from "$app/environment";
import {
    onDestroy,
    onMount,
} from "svelte";
import { userManager } from "../../auth/UserManager";
import AuthComponent from "../../components/AuthComponent.svelte";
import EnvDebugger from "../../components/EnvDebugger.svelte";
import NetworkErrorAlert from "../../components/NetworkErrorAlert.svelte";
import { getDebugConfig } from "../../lib/env";
import { getLogger } from "../../lib/logger";
import { yjsStore } from "../../stores/yjsStore.svelte";

import { createYjsClient, saveFirestoreContainerIdToServer } from "../../services";

const logger = getLogger();

let error: string | undefined = $state(undefined);
let debugInfo: any = $state({});
let hostInfo = $state("");
let portInfo = $state("");
let envConfig = getDebugConfig();
let isAuthenticated = $state(false);
let networkError: string | undefined = $state(undefined);
let isInitializing = $state(false);
let connectionStatus = $state("Disconnected");
let isConnected = $state(false);

// Process on authentication success
async function handleAuthSuccess(authResult: any) {
    logger.info("Auth Success:", authResult);
    isAuthenticated = true;

    // Automatically initialize Yjs client after successful authentication
    await initializeFluidClient();
}

// Process on authentication logout
function handleAuthLogout() {
    logger.info("Logged out");
    isAuthenticated = false;
    connectionStatus = "Disconnected";
    isConnected = false;
}

// Initialize Yjs client
async function initializeFluidClient() {
    isInitializing = true;

    try {
        // Use a fixed UUID for the debug page to avoid creating new projects on every reload
        const projectId = "00000000-0000-0000-0000-000000000000";
        console.log(`[debug] Registering debug project: ${projectId}`);
        const saved = await saveFirestoreContainerIdToServer(projectId);
        if (!saved) {
            console.error("[debug] Failed to register debug project");
            networkError = "Failed to register debug project.";
            return;
        }

        console.log(`[debug] Connecting to debug project: ${projectId}`);
        await createYjsClient(projectId);
        updateConnectionStatus();
    }
    catch (err) {
        console.error("Client initialization error:", err);
        networkError = "Failed to initialize Yjs client.";
    }
    finally {
        isInitializing = false;
    }
}

// Retry on network error
async function retryConnection() {
    networkError = undefined;
    await initializeFluidClient();
}

let healthStatus: any = $state(null);
let healthError: string | undefined = $state(undefined);

function getHealthCheckUrl() {
    let port = 7093;
    try {
        if (import.meta.env.VITE_YJS_PORT) port = Number(import.meta.env.VITE_YJS_PORT);
        if (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_YJS_PORT")) {
            port = Number(window.localStorage.getItem("VITE_YJS_PORT"));
        }
    } catch {}

    // Prefer explicitly configured HTTP URL if available
    const envHttpUrl = import.meta.env.VITE_YJS_HTTP_URL;
    if (envHttpUrl) return envHttpUrl + "/health";

    // Fallback to converting WS URL
    const wsUrl = import.meta.env.VITE_YJS_WS_URL || `ws://localhost:${port}`;

    if (wsUrl.startsWith("wss://")) {
        return wsUrl.replace("wss://", "https://").replace(/\/$/, "") + "/health";
    } else if (wsUrl.startsWith("ws://")) {
        return wsUrl.replace("ws://", "http://").replace(/\/$/, "") + "/health";
    }

    return `http://localhost:${port}/health`;
}

async function checkHealth() {
    healthStatus = null;
    healthError = undefined;
    try {
        const url = getHealthCheckUrl();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        healthStatus = await res.json();
    } catch (e) {
        healthError = e instanceof Error ? e.message : String(e);
    }
}

// Update connection status
function updateConnectionStatus() {
    const client = yjsStore.yjsClient as any;
    if (client) {
        connectionStatus = client.getConnectionStateString() || "Disconnected";
        isConnected = client.isContainerConnected || false;
        debugInfo = client.getDebugInfo();
    }
    else {
        connectionStatus = "Disconnected";
        isConnected = false;
    }
}

// Update connection status periodically
let statusInterval: any;

onMount(() => {
    console.debug("[debug/+page] Component mounted");

    try {
        // Get host info - only run in browser environment
        if (browser) {
            hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
            portInfo = window.location.port || "7070/default";
            console.info("Running on host:", hostInfo);
        }

        // Check UserManager authentication state

        isAuthenticated = userManager.getCurrentUser() !== null;

        // Automatically initialize Yjs client if authenticated
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
        error = err instanceof Error
            ? err.message
            : "An error occurred during initialization.";
    }
});

onDestroy(() => {
    console.debug("[debug/+page] Component destroying");
    // Clear periodic update
    if (statusInterval) {
        clearInterval(statusInterval);
    }
});
</script>

<svelte:head>
    <title>Outliner Debug</title>
</svelte:head>

<main>
    <h1>Outliner Debug</h1>
    <p class="subtitle">Connection Test and Debug Information</p>

    <!-- Auth Component -->
    <div class="auth-section">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isInitializing}
        <div class="loading">Loading...</div>
    {:else if error}
        <div class="error">
            <p>Error: {error}</p>
            <button onclick={() => location.reload()}>Reload</button>
        </div>
    {:else if isAuthenticated}
        <!-- Content for authenticated users -->
        <div class="authenticated-content">
            <div class="debug-card">
                <h2>Connection Status</h2>
                <div class="connection-status">
                    <div
                        class="
                            status-indicator {isConnected
                            ? 'connected'
                            : 'disconnected'}
                        "
                    >
                    </div>
                    <span id="connection-state-text">Connection State: {connectionStatus}</span>
                </div>

                <button onclick={initializeFluidClient} class="action-button">
                    Run Connection Test
                </button>

                <div class="status-details">
                    <p>Connection URL: {hostInfo}</p>
                    <p>Port: {portInfo}</p>
                </div>
            </div>

            <div class="debug-card">
                <h2>Server Health Check</h2>
                <button onclick={checkHealth} class="action-button">
                    Run Health Check (GET /health)
                </button>
                {#if healthError}
                    <div class="error" style="margin-top: 1rem;">
                        <p>Error: {healthError}</p>
                    </div>
                {:else if healthStatus}
                    <div class="result" style="margin-top: 1rem;">
                        <p>Status: {healthStatus.status}</p>
                        <details open>
                            <summary>Details (including headers)</summary>
                            <pre>{JSON.stringify(healthStatus, null, 2)}</pre>
                        </details>
                    </div>
                {/if}
            </div>

            <div class="debug-card">
                <h2>Debug Information</h2>
                <details open>
                    <summary>Environment Configuration</summary>
                    <pre>{JSON.stringify(envConfig, null, 2)}</pre>
                </details>

                <details open>
                    <summary>Yjs Client</summary>
                    <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                </details>
            </div>
        </div>
    {:else}
        <!-- Message for unauthenticated users -->
        <div class="unauthenticated-message">
            <p>
                To use debug features, please log in using the Google login button above.
            </p>
        </div>
    {/if}

    <!-- Network Error Display -->
    <NetworkErrorAlert error={networkError} retryCallback={retryConnection} />

    <!-- Environment Variable Debugger -->
    <div class="debug-card">
        <h2>Environment Variables</h2>
        <EnvDebugger />
    </div>

    <div class="back-link">
        <a href="/">Return to Main Page</a>
    </div>
</main>

<style>
main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
}

h1 {
    color: #333;
    text-align: center;
    margin-bottom: 0.5rem;
}

.subtitle {
    text-align: center;
    color: #666;
    margin-bottom: 2rem;
}

.loading {
    text-align: center;
    padding: 2rem;
    color: #666;
}

.error {
    background: #fff0f0;
    border: 1px solid #ffcccc;
    color: #d32f2f;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
}

.debug-card {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.debug-card h2 {
    margin-top: 0;
    color: #444;
    font-size: 1.2rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
}

.connection-status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: #f5f5f5;
    border-radius: 4px;
}

.status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.connected {
    background: #4caf50;
}

.disconnected {
    background: #f44336;
}

.status-details {
    margin-top: 1rem;
    font-size: 0.9rem;
    color: #666;
}

.action-button {
    background: #2196f3;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}

.action-button:hover {
    background: #1976d2;
}

details {
    margin-top: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5rem;
}

summary {
    cursor: pointer;
    padding: 0.5rem;
    font-weight: bold;
}

pre {
    background: #f5f5f5;
    padding: 1rem;
    overflow: auto;
    border-radius: 4px;
    font-size: 12px;
}

.auth-section {
    max-width: 400px;
    margin: 0 auto 2rem auto;
}

.unauthenticated-message {
    text-align: center;
    padding: 2rem;
    background: #f5f5f5;
    border-radius: 8px;
    margin: 2rem 0;
    color: #555;
}

.authenticated-content {
    margin-top: 2rem;
}

.back-link {
    text-align: center;
    margin-top: 2rem;
}

.back-link a {
    color: #2196f3;
    text-decoration: none;
}

.back-link a:hover {
    text-decoration: underline;
}
</style>
