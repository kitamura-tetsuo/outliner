<script lang="ts">
import { onMount } from "svelte";

interface Props {
    isVisible?: boolean;
}

let { isVisible = false }: Props = $props();

let searchQuery = $state("");
let replaceText = $state("");
let isRegexMode = $state(false);
let isCaseSensitive = $state(false);

function handleSearch() {
    console.log("Search:", searchQuery);
}

function handleReplace() {
    console.log("Replace:", searchQuery, "with:", replaceText);
}

function handleReplaceAll() {
    console.log("Replace all:", searchQuery, "with:", replaceText);
}

function toggleRegex() {
    isRegexMode = !isRegexMode;
}

function toggleCaseSensitive() {
    isCaseSensitive = !isCaseSensitive;
}
</script>

{#if isVisible}
<div class="search-panel">
    <div class="search-panel-header">
        <h3>検索・置換</h3>
    </div>
    
    <div class="search-panel-content">
        <div class="search-input-group">
            <label for="search-input">検索:</label>
            <input
                id="search-input"
                type="text"
                bind:value={searchQuery}
                placeholder="検索文字列を入力"
                class="search-input"
            />
            <button onclick={handleSearch} class="search-btn-action">検索</button>
        </div>
        
        <div class="replace-input-group">
            <label for="replace-input">置換:</label>
            <input
                id="replace-input"
                type="text"
                bind:value={replaceText}
                placeholder="置換文字列を入力"
                class="replace-input"
            />
            <button onclick={handleReplace} class="replace-btn">置換</button>
            <button onclick={handleReplaceAll} class="replace-all-btn">すべて置換</button>
        </div>
        
        <div class="search-options">
            <label class="option-checkbox">
                <input
                    type="checkbox"
                    bind:checked={isRegexMode}
                    onchange={toggleRegex}
                />
                正規表現
            </label>
            <label class="option-checkbox">
                <input
                    type="checkbox"
                    bind:checked={isCaseSensitive}
                    onchange={toggleCaseSensitive}
                />
                大文字小文字を区別
            </label>
        </div>
    </div>
</div>
{/if}

<style>
.search-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 400px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
}

.search-panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    background: #f8f9fa;
    border-radius: 8px 8px 0 0;
}

.search-panel-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.search-panel-content {
    padding: 16px;
}

.search-input-group,
.replace-input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}

.search-input-group label,
.replace-input-group label {
    min-width: 50px;
    font-size: 14px;
    color: #555;
}

.search-input,
.replace-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.search-input:focus,
.replace-input:focus {
    outline: none;
    border-color: #0078d7;
    box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.2);
}

.search-btn-action,
.replace-btn,
.replace-all-btn {
    padding: 8px 16px;
    border: 1px solid #0078d7;
    background: #0078d7;
    color: white;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.search-btn-action:hover,
.replace-btn:hover,
.replace-all-btn:hover {
    background: #106ebe;
}

.replace-all-btn {
    background: #d83b01;
    border-color: #d83b01;
}

.replace-all-btn:hover {
    background: #c13a00;
}

.search-options {
    display: flex;
    gap: 16px;
    margin-top: 12px;
}

.option-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #555;
    cursor: pointer;
}

.option-checkbox input[type="checkbox"] {
    margin: 0;
}
</style>
