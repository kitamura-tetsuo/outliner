<script lang="ts">
// Disable SSR (Clipboard API only works in browser environment)
import { onMount } from "svelte";

// State management
let clipboardText = $state("");
let execCommandText = $state("");
let playwrightText = $state("");
let clipboardResult = $state("");
let execCommandResult = $state("");
let permissionResult = $state("");
let playwrightResult = $state("");
let logs = $state<string[]>([]);

// Log function
function log(message: string) {
    console.log(message);
    logs = [...logs, `${new Date().toLocaleTimeString()}: ${message}`];
}

// Result display function
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

// 1. navigator.clipboard API Test
async function handleClipboardCopy() {
    try {
        // Save to global variable (for testing)
        if (typeof window !== "undefined") {
            (window as any).lastCopyText = clipboardText;
        }

        // Try both methods
        try {
            // Method 1: ClipboardEvent
            const clipboardEvent = new ClipboardEvent("copy", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });
            clipboardEvent.clipboardData?.setData("text/plain", clipboardText);

            // Dispatch event
            const textarea = document.getElementById("clipboard-text") as HTMLTextAreaElement;
            textarea.dispatchEvent(clipboardEvent);

            log(`ClipboardEvent 'copy' dispatched`);
        }
        catch (clipboardEventError: any) {
            log(`ClipboardEvent 'copy' dispatch failed: ${clipboardEventError.message}`);
        }

        // Method 2: navigator.clipboard API
        await navigator.clipboard.writeText(clipboardText);

        // Show result
        showResult("clipboard", `Copy successful: ${clipboardText}`);
        log(`navigator.clipboard.writeText successful: ${clipboardText}`);

        // Force DOM update (for testing)
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `✅ Copy successful: ${clipboardText}`;
                resultElement.classList.add("success");
                resultElement.classList.remove("error");
            }
        }, 100);
    }
    catch (err: any) {
        showResult("clipboard", `Copy failed: ${err.message}`, false);
        log(`navigator.clipboard.writeText failed: ${err.message}`);

        // Force DOM update (for testing)
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `❌ Copy failed: ${err.message}`;
                resultElement.classList.add("error");
                resultElement.classList.remove("success");
            }
        }, 100);
    }
}

async function handleClipboardPaste() {
    try {
        // Try both methods
        try {
            // Method 1: ClipboardEvent
            const clipboardEvent = new ClipboardEvent("paste", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // Get from global variable (for testing)
            const globalText = typeof window !== "undefined" ? (window as any).lastCopyText || "" : "";
            if (globalText) {
                clipboardEvent.clipboardData?.setData("text/plain", globalText);
                log(`Get text from global variable: ${globalText}`);
            }

            // Dispatch event
            const textarea = document.getElementById("clipboard-text") as HTMLTextAreaElement;
            textarea.dispatchEvent(clipboardEvent);

            log(`ClipboardEvent 'paste' dispatched`);
        }
        catch (clipboardEventError: any) {
            log(`ClipboardEvent 'paste' dispatch failed: ${clipboardEventError.message}`);
        }

        // Method 2: navigator.clipboard API
        const text = await navigator.clipboard.readText();
        clipboardText = text;

        // Show result
        showResult("clipboard", `Paste successful: ${text}`);
        log(`navigator.clipboard.readText successful: ${text}`);

        // Force DOM update (for testing)
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `✅ Paste successful: ${text}`;
                resultElement.classList.add("success");
                resultElement.classList.remove("error");
            }
        }, 100);
    }
    catch (err: any) {
        showResult("clipboard", `Paste failed: ${err.message}`, false);
        log(`navigator.clipboard.readText failed: ${err.message}`);

        // Force DOM update (for testing)
        setTimeout(() => {
            const resultElement = document.querySelector(".test-section:first-child .result");
            if (resultElement) {
                resultElement.textContent = `❌ Paste failed: ${err.message}`;
                resultElement.classList.add("error");
                resultElement.classList.remove("success");
            }
        }, 100);
    }
}

// 2. document.execCommand API Test
function handleExecCommandCopy() {
    try {
        const textarea = document.getElementById("execcommand-text") as HTMLTextAreaElement;
        textarea.select();
        const success = document.execCommand("copy");
        if (success) {
            showResult("execCommand", `Copy successful: ${execCommandText}`);
            log(`document.execCommand("copy") successful: ${execCommandText}`);
        }
        else {
            showResult("execCommand", "Copy failed", false);
            log('document.execCommand("copy") failed');
        }
    }
    catch (err: any) {
        showResult("execCommand", `Copy failed: ${err.message}`, false);
        log(`document.execCommand("copy") failed: ${err.message}`);
    }
}

function handleExecCommandPaste() {
    try {
        const textarea = document.getElementById("execcommand-text") as HTMLTextAreaElement;
        textarea.focus();
        const success = document.execCommand("paste");
        if (success) {
            execCommandText = textarea.value;
            showResult("execCommand", `Paste successful: ${execCommandText}`);
            log(`document.execCommand("paste") successful: ${execCommandText}`);
        }
        else {
            showResult("execCommand", "Paste failed", false);
            log('document.execCommand("paste") failed');
        }
    }
    catch (err: any) {
        showResult("execCommand", `Paste failed: ${err.message}`, false);
        log(`document.execCommand("paste") failed: ${err.message}`);
    }
}

// 3. Clipboard Permission Test
async function checkPermissions() {
    try {
        if (!navigator.permissions) {
            showResult("permission", "navigator.permissions API is not supported", false);
            log("navigator.permissions API is not supported");
            return;
        }

        const clipboardRead = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
        const clipboardWrite = await navigator.permissions.query({ name: "clipboard-write" as PermissionName });

        showResult("permission", `clipboard-read: ${clipboardRead.state}, clipboard-write: ${clipboardWrite.state}`);
        log(`clipboard-read: ${clipboardRead.state}, clipboard-write: ${clipboardWrite.state}`);
    }
    catch (err: any) {
        showResult("permission", `Permission check failed: ${err.message}`, false);
        log(`Permission check failed: ${err.message}`);
    }
}

// 4. For Playwright Test
async function handlePlaywrightCopy() {
    try {
        await navigator.clipboard.writeText(playwrightText);
        showResult("playwright", `Copy successful: ${playwrightText}`);
        log(`Playwright Copy successful: ${playwrightText}`);
        // Save to global variable (for testing)
        (window as any).lastCopiedText = playwrightText;
    }
    catch (err: any) {
        showResult("playwright", `Copy failed: ${err.message}`, false);
        log(`Playwright Copy failed: ${err.message}`);
    }
}

async function handlePlaywrightPaste() {
    try {
        const text = await navigator.clipboard.readText();
        playwrightText = text;
        showResult("playwright", `Paste successful: ${text}`);
        log(`Playwright Paste successful: ${text}`);
        // Save to global variable (for testing)
        (window as any).lastPastedText = text;
    }
    catch (err: any) {
        showResult("playwright", `Paste failed: ${err.message}`, false);
        log(`Playwright Paste failed: ${err.message}`);
    }
}

// On page load
onMount(() => {
    log("Page loaded");
    // Check Clipboard API support
    if (navigator.clipboard) {
        log("navigator.clipboard API is supported");
    }
    else {
        log("navigator.clipboard API is not supported");
    }
});
</script>

<svelte:head>
    <title>Clipboard API Test</title>
</svelte:head>

<main>
    <h1>Clipboard API Test</h1>
    <p>This page is for testing the Clipboard API.</p>

    <div class="container">
        <div class="test-section">
            <h2>1. navigator.clipboard API Test</h2>
            <textarea
                id="clipboard-text"
                bind:value={clipboardText}
                placeholder="Enter text to copy here"
            ></textarea>
            <div>
                <button onclick={handleClipboardCopy}>Copy</button>
                <button onclick={handleClipboardPaste}>Paste</button>
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
            <h2>2. document.execCommand API Test</h2>
            <textarea
                id="execcommand-text"
                bind:value={execCommandText}
                placeholder="Enter text to copy here"
            ></textarea>
            <div>
                <button onclick={handleExecCommandCopy}>Copy</button>
                <button onclick={handleExecCommandPaste}>Paste</button>
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
            <h2>3. Clipboard Permission Test</h2>
            <button onclick={checkPermissions}>Check Clipboard Permissions</button>
            <div
                class="result"
                class:success={permissionResult.startsWith("✅")}
                class:error={permissionResult.startsWith("❌")}
            >
                {permissionResult}
            </div>
        </div>

        <div class="test-section">
            <h2>4. For Playwright Test</h2>
            <textarea
                id="playwright-text"
                bind:value={playwrightText}
                placeholder="Text from Playwright will appear here"
            ></textarea>
            <div>
                <button onclick={handlePlaywrightCopy}>Copy</button>
                <button onclick={handlePlaywrightPaste}>Paste</button>
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
        <h3>Logs</h3>
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
