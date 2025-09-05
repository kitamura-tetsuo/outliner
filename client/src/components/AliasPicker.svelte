<script lang="ts">
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";

let filteredOptions = $state<{ id: string; path: string; }[]>([]);
let selectedIndex = $state(0);
let pickerElement = $state<HTMLDivElement>();
let inputElement = $state<HTMLInputElement>();

$effect(() => {
    const q = aliasPickerStore.query.toLowerCase();
    filteredOptions = aliasPickerStore.options.filter(o => o.path.toLowerCase().includes(q));
    // フィルタリング後は選択インデックスをリセット
    selectedIndex = 0;
});

// エイリアスピッカーが表示された時にフォーカスを設定
$effect(() => {
    if (aliasPickerStore.isVisible) {
        // 少し遅延してからフォーカスを設定
        setTimeout(() => {
            if (inputElement) {
                inputElement.focus();
            } else if (pickerElement) {
                pickerElement.focus();
            }
        }, 100);
    }
});

function confirm(id: string) {
    console.log("AliasPicker confirm called with id:", id);
    try {
        aliasPickerStore.confirmById(id);
        console.log("AliasPicker confirmById completed");
    }
    catch (error) {
        console.error("AliasPicker confirmById error:", error);
    }
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        aliasPickerStore.hide();
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (filteredOptions[selectedIndex]) {
            confirm(filteredOptions[selectedIndex].id);
        }
        return;
    }
}
</script>
{#if aliasPickerStore.isVisible}
    <div
        class="alias-picker"
        onkeydown={handleKeydown}
        tabindex="0"
        role="dialog"
        bind:this={pickerElement}
    >
        <input
            type="text"
            bind:value={aliasPickerStore.query}
            placeholder="Select item"
            onkeydown={handleKeydown}
            bind:this={inputElement}
        />
        <ul>
            {#each filteredOptions as opt, index}
                <li class:selected={index === selectedIndex}>
                    <button
                        data-id={opt.id}
                        onclick={() => confirm(opt.id)}
                        onmouseenter={() => selectedIndex = index}
                    >
                        {opt.path}
                    </button>
                </li>
            {/each}
        </ul>
    </div>
{/if}
<style>
.alias-picker {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    padding: 8px;
    z-index: 1000;
    max-height: 300px;
    overflow: auto;
}
.alias-picker ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 200px;
    overflow: auto;
}
.alias-picker li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px;
    border: none;
    background: none;
    cursor: pointer;
}
.alias-picker li.selected button {
    background-color: #e6f3ff;
    color: #0066cc;
}
.alias-picker li button:hover {
    background-color: #f0f8ff;
}
</style>
