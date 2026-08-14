<script lang="ts">
    import { onMount } from "svelte";
    import type { PasteSpecialChoice, PasteSpecialVariant } from "../services/clipboard/pasteSpecial";

    interface Props {
        choices: PasteSpecialChoice[];
        onchoose: (variant: PasteSpecialVariant | undefined) => void;
    }

    let { choices, onchoose }: Props = $props();
    let dialog: HTMLDivElement | undefined = $state();

    onMount(() => dialog?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());

    function onKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") onchoose(undefined);
    }
</script>

<div class="backdrop" role="presentation" onkeydown={onKeydown}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="paste-special-title" bind:this={dialog} data-testid="paste-special-dialog">
        <h2 id="paste-special-title">Paste Special</h2>
        <div class="choices">
            {#each choices as choice (choice.variant)}
                <button
                    type="button"
                    disabled={!choice.available}
                    aria-describedby={`${choice.variant}-description`}
                    data-testid={`paste-special-${choice.variant}`}
                    onclick={() => onchoose(choice.variant)}
                >
                    <span class="label">{choice.label}{choice.isDefault ? " (default)" : ""}</span>
                    <span id={`${choice.variant}-description`} class="description">
                        {choice.available ? choice.description : choice.reason}
                    </span>
                </button>
            {/each}
        </div>
        <button type="button" class="cancel" onclick={() => onchoose(undefined)}>Cancel</button>
    </div>
</div>

<style>
    .backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgb(0 0 0 / 35%); }
    .dialog { width: min(32rem, calc(100vw - 2rem)); padding: 1.25rem; border-radius: .75rem; background: white; box-shadow: 0 18px 48px rgb(0 0 0 / 25%); }
    h2 { margin: 0 0 1rem; font-size: 1.2rem; }
    .choices { display: grid; gap: .5rem; }
    .choices button { display: grid; gap: .2rem; padding: .75rem; text-align: left; border: 1px solid #d1d5db; border-radius: .5rem; background: white; }
    .choices button:not(:disabled):hover, .choices button:not(:disabled):focus-visible { border-color: #2563eb; background: #eff6ff; }
    .choices button:disabled { color: #6b7280; background: #f3f4f6; }
    .label { font-weight: 600; }
    .description { font-size: .875rem; }
    .cancel { margin-top: 1rem; padding: .5rem .75rem; }
</style>
