<script lang="ts">
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { onMount } from "svelte";


type Option = { id: string; path: string; };

let selectedIndex = $state(0);
let pickerElement = $state<HTMLDivElement>();
let inputElement = $state<HTMLInputElement>();
// Avoid two-way binding to store to prevent effect cycles
let query = $state(aliasPickerStore.query || "");
// options は常に aliasPickerStore.options を参照（{#each} で宣言的レンダリング）

let visible = $derived(!!aliasPickerStore.isVisible);

onMount(() => {
    const onVis = (e: any) => { try { visible = !!(e?.detail?.visible); } catch {} };
    window.addEventListener("aliaspicker-visibility", onVis as any);
    return () => window.removeEventListener("aliaspicker-visibility", onVis as any);
});

// store.isVisible test ﬂ

//


function getFilteredOptions(): Option[] {
    const q = (query || "").toLowerCase();
    const selfId = aliasPickerStore.itemId as string | null;
    const opts: Option[] = Array.isArray(aliasPickerStore.options) ? (aliasPickerStore.options as Option[]) : [];
    return opts.filter((o: Option) => o.id !== selfId && o.path.toLowerCase().includes(q));
}

function clampSelectedIndex(options: Option[]) {
    if (options.length === 0) {
        selectedIndex = 0;
        return;
    }
    if (selectedIndex >= options.length) {
        selectedIndex = options.length - 1;
    }
    if (selectedIndex < 0) {
        selectedIndex = 0;
    }
}





// 入力値が変わった時のみ選択インデックスをリセット（DOMイベントで副作用を限定）
function handleInput() {
    selectedIndex = 0;
    try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
}

function confirm(id: string) {
    try {
        aliasPickerStore.confirmById(id);
    } catch (error) {
        console.warn("AliasPicker confirm error:", error);
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
        const options = getFilteredOptions();
        selectedIndex = Math.min(selectedIndex + 1, Math.max(options.length - 1, 0));
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const options = getFilteredOptions();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {}
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const options = getFilteredOptions();
        if (options[selectedIndex]) {
            confirm(options[selectedIndex].id);


        } else {
            aliasPickerStore.hide();
        }
        return;
    }
}

// Initialize localOptions from store via event to avoid tight coupling


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
{#if visible}
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
            {#each getFilteredOptions() as opt, index (opt.id)}
                <li class:selected={index === selectedIndex}>
                    <button
                        data-id={opt.id}
                        onclick={() => confirm(opt.id)}
                        onmouseenter={() => { selectedIndex = index; try { aliasPickerStore.setSelectedIndex?.(selectedIndex); } catch {} }}
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
