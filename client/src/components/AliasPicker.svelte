<script lang="ts">
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";

let selectedIndex = $state(0);
let pickerElement = $state<HTMLDivElement>();
let inputElement = $state<HTMLInputElement>();
// Avoid two-way binding to store to prevent effect cycles
let query = $state(aliasPickerStore.query || "");
let localOptions = $state<{ id: string; path: string; }[]>([]);

// 検索クエリと候補から導出（副作用なし）
let filteredOptions = $derived.by(() => {
    const q = (query || "").toLowerCase();
    const opts = localOptions || [];
    // 自己参照（現在のエイリアスアイテム）を除外
    const selfId = aliasPickerStore.itemId;
    return opts.filter(o => o.id !== selfId && o.path.toLowerCase().includes(q));
});

// 入力値が変わった時のみ選択インデックスをリセット（DOMイベントで副作用を限定）
function handleInput() {
    selectedIndex = 0;
    try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
}

function confirm(id: string) {
    console.log("AliasPicker confirm called with id:", id);
    console.log("AliasPicker filteredOptions:", filteredOptions.map(o => ({ id: o.id, path: o.path })));
    console.log("AliasPicker localOptions:", localOptions.map(o => ({ id: o.id, path: o.path })));
    try {
        const beforeVisible = aliasPickerStore.isVisible;
        console.log("AliasPicker calling confirmById with id:", id);
        aliasPickerStore.confirmById(id);
        console.log("AliasPicker confirmById completed, isVisible:", aliasPickerStore.isVisible);
        // ストア側の options とローカル options の不整合で confirmById が見つけられない場合のフォールバック
        if (beforeVisible && aliasPickerStore.isVisible) {
            console.log("AliasPicker picker still visible, trying fallback");
            const local = (filteredOptions.find(o => o.id === id) || localOptions.find(o => o.id === id));
            if (local) {
                console.log("AliasPicker fallback confirm using path:", local.path);
                aliasPickerStore.confirm(local.path);
            } else {
                console.warn("AliasPicker fallback confirm failed: option not in local options");
                aliasPickerStore.hide();
            }
        }
    }
    catch (error) {
        console.error("AliasPicker confirmById error:", error);
    }
}

function handleKeydown(event: KeyboardEvent) {
    console.log("AliasPicker.handleKeydown key=", event.key);
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
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        console.log("AliasPicker: selectedIndex after ArrowDown:", selectedIndex, "options=", filteredOptions.length);
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        console.log("AliasPicker: selectedIndex after ArrowUp:", selectedIndex, "options=", filteredOptions.length);
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (filteredOptions[selectedIndex]) {
            console.log("AliasPicker.handleKeydown confirming id=", filteredOptions[selectedIndex].id);
            confirm(filteredOptions[selectedIndex].id);
        } else {
            // No option resolved; close to avoid hanging tests
            console.log("AliasPicker.handleKeydown no option, hiding");
            aliasPickerStore.hide();
        }
        return;
    }
}

// Initialize localOptions from store via event to avoid tight coupling
import { onMount, onDestroy } from "svelte";
onMount(() => {
    const handler = (e: any) => {
        const opts = e?.detail?.options ?? [];
        localOptions = Array.isArray(opts) ? opts : [];
        selectedIndex = 0;
    };
    window.addEventListener("aliaspicker-options", handler as any);
    // seed once if already present
    try { if (Array.isArray(aliasPickerStore.options)) localOptions = [...aliasPickerStore.options]; } catch {}
    // グローバルキー監視（フォーカスに依存せずキーボード操作を受け付ける）
    const keyListener = (ev: KeyboardEvent) => {
        if (!aliasPickerStore.isVisible) return;
        handleKeydown(ev);
    };
    window.addEventListener("keydown", keyListener, { capture: true });

    return () => {
        window.removeEventListener("aliaspicker-options", handler as any);
        window.removeEventListener("keydown", keyListener, { capture: true } as any);
    };
});

// 可視化されたら直ちにフォーカスを与える（初回/再表示どちらも）
$effect(() => {
    if (aliasPickerStore.isVisible) {
        try {
            // まずピッカー本体
            pickerElement?.focus();
            // 次に検索入力へ（存在すれば）
            setTimeout(() => {
                inputElement?.focus();
            }, 0);
            // 外部ストアへ選択インデックスを同期
            try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        } catch {}
    }
});
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
            bind:value={query}
            placeholder="Select item"
            oninput={handleInput}
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
