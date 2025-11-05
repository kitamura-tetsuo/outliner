<script lang="ts">
// SSRを無効化（クリップボードAPIはブラウザ環境でのみ動作）
import { onMount } from "svelte";

// 状態管理
let clipboardText = $state("");
let execCommandText = $state("");
let playwrightText = $state("");
let clipboardResult = $state("");
let execCommandResult = $state("");
let permissionResult = $state("");
let playwrightResult = $state("");
let logs = $state<string[]>([]);

// ログ関数
function log(message: string) {
    console.log(message);
    logs = [...logs, `${new Date().toLocaleTimeString()}: ${message}`];
}

// 結果表示関数
function showResult(
    resultVar: "clipboard" | "execCommand" | "permission" | "playwright",
    message: string,
    isSuccess = true,
) {
    const resultText = isSuccess ? `✅ ${message}` : `❌ ${message}`;

    switch (resultVar) {
        case "clipboard":
            clipboardResult = resultText;
            break;
        case "execCommand":
            execCommandResult = resultText;
            break;
        case "permission":
            permissionResult = resultText;
            break;
        case "playwright":
            playwrightResult = resultText;
            break;
    }
}

// 1. navigator.clipboard APIテスト
async function handleClipboardCopy() {
    try {
        // グローバル変数に保存（テスト用）
        if (typeof window !== "undefined") {
            (window).lastCopyText = clipboardText;
        }

        // 両方の方法を試す
        try {
            // 方法1: ClipboardEvent
            const clipboardEvent = new ClipboardEvent("copy", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });
            clipboardEvent.clipboardData?.setData("text/plain", clipboardText);

            // イベントをディスパッチ
            const textarea = document.getElementById("clipboard-text") as HTMLTextAreaElement;
            textarea.dispatchEvent(clipboardEvent);

            log(`ClipboardEvent 'copy' をディスパッチしました`);
        }
        catch (clipboardEventError) {
            log(`ClipboardEvent 'copy' ディスパッチ失敗: ${clipboardEventError.message}`);
        }

        // 方法2: navigator.clipboard API
        await navigator.clipboard.writeText(clipboardText);

        // 結果を表示
        showResult("clipboard", `コピー成功: ${clipboardText}`);
        log(`navigator.clipboard.writeText 成功: ${clipboardText}`);

        // DOMを強制的に更新（テスト用）
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `✅ コピー成功: ${clipboardText}`;
                resultElement.classList.add("success");
                resultElement.classList.remove("error");
            }
        }, 100);
    }
    catch (err) {
        showResult("clipboard", `コピー失敗: ${err.message}`, false);
        log(`navigator.clipboard.writeText 失敗: ${err.message}`);

        // DOMを強制的に更新（テスト用）
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `❌ コピー失敗: ${err.message}`;
                resultElement.classList.add("error");
                resultElement.classList.remove("success");
            }
        }, 100);
    }
}

async function handleClipboardPaste() {
    try {
        // 両方の方法を試す
        try {
            // 方法1: ClipboardEvent
            const clipboardEvent = new ClipboardEvent("paste", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // グローバル変数から取得（テスト用）
            const globalText = typeof window !== "undefined" ? (window).lastCopyText || "" : "";
            if (globalText) {
                clipboardEvent.clipboardData?.setData("text/plain", globalText);
                log(`グローバル変数からテキストを取得: ${globalText}`);
            }

            // イベントをディスパッチ
            const textarea = document.getElementById("clipboard-text") as HTMLTextAreaElement;
            textarea.dispatchEvent(clipboardEvent);

            log(`ClipboardEvent 'paste' をディスパッチしました`);
        }
        catch (clipboardEventError: unknown) {
            log(`ClipboardEvent 'paste' ディスパッチ失敗: ${clipboardEventError.message}`);
        }

        // 方法2: navigator.clipboard API
        const text = await navigator.clipboard.readText();
        clipboardText = text;

        // 結果を表示
        showResult("clipboard", `ペースト成功: ${text}`);
        log(`navigator.clipboard.readText 成功: ${text}`);

        // DOMを強制的に更新（テスト用）
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `✅ ペースト成功: ${text}`;
                resultElement.classList.add("success");
                resultElement.classList.remove("error");
            }
        }, 100);
    }
    catch (err: unknown) {
        showResult("clipboard", `ペースト失敗: ${err.message}`, false);
        log(`navigator.clipboard.readText 失敗: ${err.message}`);

        // DOMを強制的に更新（テスト用）
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `❌ ペースト失敗: ${err.message}`;
                resultElement.classList.add("error");
                resultElement.classList.remove("success");
            }
        }, 100);
    }
}

// 2. document.execCommand APIテスト
function handleExecCommandCopy() {
    try {
        const textarea = document.getElementById("execcommand-text") as HTMLTextAreaElement;
        textarea.select();
        const success = document.execCommand("copy");
        if (success) {
            showResult("execCommand", `コピー成功: ${execCommandText}`);
            log(`document.execCommand("copy") 成功: ${execCommandText}`);
        }
        else {
            showResult("execCommand", "コピー失敗", false);
            log('document.execCommand("copy") 失敗');
        }
    }
    catch (err) {
        showResult("execCommand", `コピー失敗: ${err.message}`, false);
        log(`document.execCommand("copy") 失敗: ${err.message}`);
    }
}

function handleExecCommandPaste() {
    try {
        const textarea = document.getElementById("execcommand-text") as HTMLTextAreaElement;
        textarea.focus();
        const success = document.execCommand("paste");
        if (success) {
            execCommandText = textarea.value;
            showResult("execCommand", `ペースト成功: ${execCommandText}`);
            log(`document.execCommand("paste") 成功: ${execCommandText}`);
        }
        else {
            showResult("execCommand", "ペースト失敗", false);
            log('document.execCommand("paste") 失敗');
        }
    }
    catch (err) {
        showResult("execCommand", `ペースト失敗: ${err.message}`, false);
        log(`document.execCommand("paste") 失敗: ${err.message}`);
    }
}

// 3. クリップボード権限テスト
async function checkPermissions() {
    try {
        if (!navigator.permissions) {
            showResult("permission", "navigator.permissions APIがサポートされていません", false);
            log("navigator.permissions APIがサポートされていません");
            return;
        }

        const clipboardRead = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
        const clipboardWrite = await navigator.permissions.query({ name: "clipboard-write" as PermissionName });

        showResult("permission", `clipboard-read: ${clipboardRead.state}, clipboard-write: ${clipboardWrite.state}`);
        log(`clipboard-read: ${clipboardRead.state}, clipboard-write: ${clipboardWrite.state}`);
    }
    catch (err) {
        showResult("permission", `権限確認失敗: ${err.message}`, false);
        log(`権限確認失敗: ${err.message}`);
    }
}

// 4. Playwrightテスト用
async function handlePlaywrightCopy() {
    try {
        await navigator.clipboard.writeText(playwrightText);
        showResult("playwright", `コピー成功: ${playwrightText}`);
        log(`Playwright用コピー成功: ${playwrightText}`);
        // グローバル変数に保存（テスト用）
        (window).lastCopiedText = playwrightText;
    }
    catch (err) {
        showResult("playwright", `コピー失敗: ${err.message}`, false);
        log(`Playwright用コピー失敗: ${err.message}`);
    }
}

async function handlePlaywrightPaste() {
    try {
        const text = await navigator.clipboard.readText();
        playwrightText = text;
        showResult("playwright", `ペースト成功: ${text}`);
        log(`Playwright用ペースト成功: ${text}`);
        // グローバル変数に保存（テスト用）
        (window).lastPastedText = text;
    }
    catch (err) {
        showResult("playwright", `ペースト失敗: ${err.message}`, false);
        log(`Playwright用ペースト失敗: ${err.message}`);
    }
}

// ページ読み込み時の処理
onMount(() => {
    log("ページが読み込まれました");
    // クリップボードAPIのサポート状況を確認
    if (navigator.clipboard) {
        log("navigator.clipboard APIがサポートされています");
    }
    else {
        log("navigator.clipboard APIがサポートされていません");
    }
});
</script>

<svelte:head>
    <title>クリップボードAPIテスト</title>
</svelte:head>

<main>
    <h1>クリップボードAPIテスト</h1>
    <p>このページはクリップボードAPIのテストを行うためのものです。</p>

    <div class="container">
        <div class="test-section">
            <h2>1. navigator.clipboard APIテスト</h2>
            <textarea
                id="clipboard-text"
                bind:value={clipboardText}
                placeholder="ここにコピーするテキストを入力してください"
            ></textarea>
            <div>
                <button onclick={handleClipboardCopy}>コピー</button>
                <button onclick={handleClipboardPaste}>ペースト</button>
            </div>
            <div
                class="result"
                class:success={clipboardResult.startsWith("✅")}
                class:error={clipboardResult.startsWith("❌")}
            >
                {clipboardResult}
            </div>
        </div>

        <div class="test-section">
            <h2>2. document.execCommand APIテスト</h2>
            <textarea
                id="execcommand-text"
                bind:value={execCommandText}
                placeholder="ここにコピーするテキストを入力してください"
            ></textarea>
            <div>
                <button onclick={handleExecCommandCopy}>コピー</button>
                <button onclick={handleExecCommandPaste}>ペースト</button>
            </div>
            <div
                class="result"
                class:success={execCommandResult.startsWith("✅")}
                class:error={execCommandResult.startsWith("❌")}
            >
                {execCommandResult}
            </div>
        </div>

        <div class="test-section">
            <h2>3. クリップボード権限テスト</h2>
            <button onclick={checkPermissions}>クリップボード権限を確認</button>
            <div
                class="result"
                class:success={permissionResult.startsWith("✅")}
                class:error={permissionResult.startsWith("❌")}
            >
                {permissionResult}
            </div>
        </div>

        <div class="test-section">
            <h2>4. Playwrightテスト用</h2>
            <textarea
                id="playwright-text"
                bind:value={playwrightText}
                placeholder="Playwrightからのテキストがここに表示されます"
            ></textarea>
            <div>
                <button onclick={handlePlaywrightCopy}>コピー</button>
                <button onclick={handlePlaywrightPaste}>ペースト</button>
            </div>
            <div
                class="result"
                class:success={playwrightResult.startsWith("✅")}
                class:error={playwrightResult.startsWith("❌")}
            >
                {playwrightResult}
            </div>
        </div>
    </div>

    <div class="log-container">
        <h3>ログ</h3>
        <div id="log">
            {#each logs as logEntry, index (index)}
                <div>{logEntry}</div>
            {/each}
        </div>
    </div>
</main>

<style>
main {
    font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    line-height: 1.6;
}
.container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}
.test-section {
    border: 1px solid #ddd;
    padding: 20px;
    border-radius: 5px;
}
button {
    padding: 8px 16px;
    background-color: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 10px;
    margin-bottom: 10px;
}
button:hover {
    background-color: #45a049;
}
textarea {
    width: 100%;
    height: 100px;
    padding: 10px;
    margin-bottom: 10px;
    border-radius: 4px;
    border: 1px solid #ddd;
}
.result {
    margin-top: 10px;
    padding: 10px;
    background-color: #f8f8f8;
    border-radius: 4px;
    min-height: 20px;
}
.success {
    color: green;
}
.error {
    color: red;
}
.log-container {
    margin-top: 20px;
    border: 1px solid #ddd;
    padding: 10px;
    border-radius: 4px;
    background-color: #f8f8f8;
    max-height: 200px;
    overflow-y: auto;
}
</style>
