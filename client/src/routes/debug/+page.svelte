<script lang="ts">
    import { onMount } from "svelte";
    import EnvDebugger from "../../components/EnvDebugger.svelte";
    import { getDebugConfig } from "../../lib/env";
    import { getLogger } from "../../lib/logger";
    import { userManager } from "../../auth/UserManager";
    import { getPollingStats, resetPollingStats } from "../../lib/pollingMonitor";

    const logger = getLogger("debug-page");
    const debugConfig = getDebugConfig();

    let pollingStats = $state<Record<string, any>>({});
    let timer: ReturnType<typeof setInterval>;

    function updateStats() {
        pollingStats = getPollingStats();
    }

    onMount(() => {
        logger.info("Debug page mounted", { config: debugConfig });
        updateStats();
        timer = setInterval(updateStats, 1000);

        return () => {
            clearInterval(timer);
        };
    });

    function handleResetStats() {
        resetPollingStats();
        updateStats();
    }

    // Function to check health check URL
    function getHealthCheckUrl() {
        // Use VITE_YJS_HTTP_URL if available
        if (import.meta.env.VITE_YJS_HTTP_URL) {
            return `${import.meta.env.VITE_YJS_HTTP_URL}/health`;
        }

        // Otherwise derive from VITE_YJS_WS_URL (convert ws/wss to http/https)
        const wsUrl = import.meta.env.VITE_YJS_WS_URL || "ws://localhost:1234";
        const httpUrl = wsUrl.replace(/^ws/, "http");
        return `${httpUrl}/health`;
    }

    async function checkServerHealth() {
        try {
            const url = getHealthCheckUrl();
            const res = await fetch(url);
            const text = await res.text();
            alert(`Server Health: ${res.status} ${res.statusText}\n${text}`);
        } catch (e: any) {
            alert(`Health check failed: ${e.message}`);
        }
    }

    async function checkAuthToken() {
        const user = userManager.getCurrentUser();
        if (!user) {
            alert("Not logged in");
            return;
        }
        try {
            const token = await userManager.auth.currentUser?.getIdToken();
            console.log("ID Token:", token);
            alert("Token logged to console");
        } catch (e: any) {
            alert(`Failed to get token: ${e.message}`);
        }
    }
</script>

<div class="debug-page">
    <h1>Debug Tools</h1>

    <section>
        <h2>Environment Variables</h2>
        <EnvDebugger />
    </section>

    <section>
        <h2>Polling Analysis</h2>
        <button onclick={handleResetStats}>Reset Stats</button>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Event</th>
                    <th>Count</th>
                    <th>Avg Interval (ms)</th>
                </tr>
            </thead>
            <tbody>
                {#each Object.entries(pollingStats) as [name, stat]}
                    <tr>
                        <td>{name}</td>
                        <td>{stat.count}</td>
                        <td>{stat.avgInterval}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </section>

    <section>
        <h2>Connection Test</h2>
        <div class="actions">
            <button onclick={checkServerHealth}>Check Yjs Server Health</button>
            <button onclick={checkAuthToken}>Check Auth Token</button>
        </div>
    </section>
</div>

<style>
    .debug-page {
        padding: 20px;
        max-width: 800px;
        margin: 0 auto;
    }

    section {
        margin-bottom: 30px;
        border: 1px solid #ddd;
        padding: 20px;
        border-radius: 8px;
    }

    h2 {
        margin-top: 0;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
    }

    .stats-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }

    .stats-table th, .stats-table td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
    }

    .stats-table th {
        background-color: #f5f5f5;
    }

    .actions {
        display: flex;
        gap: 10px;
    }

    button {
        padding: 8px 16px;
        background-color: #0078d7;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:hover {
        background-color: #005a9e;
    }
</style>
