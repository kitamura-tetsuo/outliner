<script lang="ts">
import { onMount } from "svelte";
import { getDebugConfig } from "../lib/env";

let debugConfig = getDebugConfig();
let rawEnv = $state({});
let importMetaEnv: Record<string, string> = {};
let windowEnv = {};
let firebaseEmulatorInfo = $state({});

onMount(() => {
    // Get environment variables from import.meta.env
    if (typeof window !== "undefined" && import.meta?.env) {
        // Safely copy environment variables (do not display actual values)
        const envVars: Record<string, string> = {};
        Object.keys(import.meta.env).forEach(key => {
            // Do not display sensitive information such as API keys
            if (
                key.includes("KEY") ||
                key.includes("SECRET") ||
                key.includes("TOKEN")
            ) {
                envVars[key] = "***REDACTED***";
            }
            else {
                envVars[key] = import.meta.env[key] || "[NOT SET]";
            }
        });
        importMetaEnv = envVars;
    }

    // Collect Firebase Emulator related information
    if (typeof window !== "undefined") {
        firebaseEmulatorInfo = {
            VITE_USE_FIREBASE_EMULATOR: import.meta.env
                .VITE_USE_FIREBASE_EMULATOR,
            VITE_FIREBASE_EMULATOR_HOST: import.meta.env
                .VITE_FIREBASE_EMULATOR_HOST,
            VITE_FIRESTORE_EMULATOR_PORT: import.meta.env
                .VITE_FIRESTORE_EMULATOR_PORT,
            VITE_AUTH_EMULATOR_PORT: import.meta.env
                .VITE_AUTH_EMULATOR_PORT,
            // Get values from LocalStorage as well
            localStorage_VITE_USE_FIREBASE_EMULATOR: window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR"),
            localStorage_VITE_FIREBASE_EMULATOR_HOST: window.localStorage?.getItem(
                "VITE_FIREBASE_EMULATOR_HOST",
            ),
        };
    }

    // Set raw environment variables
    rawEnv = { importMetaEnv, windowEnv, firebaseEmulatorInfo };
});
</script>

<div class="env-debugger">
    <h3>Environment Variable Debugger</h3>

    <div class="env-section">
        <h4>Environment Configuration (from lib/env.ts)</h4>
        <pre>{JSON.stringify(debugConfig, null, 2)}</pre>
    </div>

    <div class="env-section">
        <h4>Firebase Emulator Configuration</h4>
        <pre>{JSON.stringify(firebaseEmulatorInfo, null, 2)}</pre>
    </div>

    <div class="env-section">
        <h4>All Environment Variables</h4>
        <pre>{JSON.stringify(rawEnv, null, 2)}</pre>
    </div>
</div>

<style>
.env-debugger {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1rem;
    margin: 1rem 0;
}

.env-section {
    margin-bottom: 1rem;
}

h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #495057;
}

h4 {
    color: #6c757d;
    margin-bottom: 0.5rem;
}

pre {
    background: #f1f3f5;
    padding: 0.75rem;
    border-radius: 4px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.4;
}
</style>
