<script lang="ts">
import { onMount } from "svelte";
import { getDebugConfig } from "../lib/env";

let debugConfig = getDebugConfig();
let rawEnv = $state({});
let importMetaEnv: Record<string, string> = {};
let windowEnv = {};
let firebaseEmulatorInfo = $state({});

onMount(() => {
    // import.meta.envから環境変数を取得
    if (typeof window !== "undefined" && import.meta?.env) {
        // 安全に環境変数をコピー（実際の値は表示しない）
        const envVars: Record<string, string> = {};
        Object.keys(import.meta.env).forEach(key => {
            // APIキーなどの機密情報は表示しない
            if (key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN")) {
                envVars[key] = "***REDACTED***";
            }
            else {
                envVars[key] = import.meta.env[key] || "[NOT SET]";
            }
        });
        importMetaEnv = envVars;
    }

    // Firebase Emulator関連の情報を収集
    if (typeof window !== "undefined") {
        firebaseEmulatorInfo = {
            VITE_USE_FIREBASE_EMULATOR: import.meta.env.VITE_USE_FIREBASE_EMULATOR,
            VITE_FIRESTORE_EMULATOR_HOST: import.meta.env.VITE_FIRESTORE_EMULATOR_HOST,
            VITE_FIRESTORE_EMULATOR_PORT: import.meta.env.VITE_FIRESTORE_EMULATOR_PORT,
            VITE_AUTH_EMULATOR_HOST: import.meta.env.VITE_AUTH_EMULATOR_HOST,
            VITE_AUTH_EMULATOR_PORT: import.meta.env.VITE_AUTH_EMULATOR_PORT,
            VITE_FIREBASE_EMULATOR_HOST: import.meta.env.VITE_FIREBASE_EMULATOR_HOST,
            VITE_FIREBASE_AUTH_EMULATOR_HOST: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST,
            // LocalStorageからの値も取得
            localStorage_VITE_USE_FIREBASE_EMULATOR: window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR"),
            localStorage_VITE_FIRESTORE_EMULATOR_HOST: window.localStorage?.getItem("VITE_FIRESTORE_EMULATOR_HOST"),
            localStorage_VITE_AUTH_EMULATOR_HOST: window.localStorage?.getItem("VITE_AUTH_EMULATOR_HOST"),
        };
    }

    // 生の環境変数を設定
    rawEnv = { importMetaEnv, windowEnv, firebaseEmulatorInfo };
});
</script>

<div class="env-debugger">
    <h3>環境変数デバッガー</h3>

    <div class="env-section">
        <h4>環境設定（lib/env.ts から）</h4>
        <pre>{JSON.stringify(debugConfig, null, 2)}</pre>
    </div>

    <div class="env-section">
        <h4>Firebase Emulator設定</h4>
        <pre>{JSON.stringify(firebaseEmulatorInfo, null, 2)}</pre>
    </div>

    <div class="env-section">
        <h4>すべての環境変数</h4>
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
