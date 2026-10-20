<script lang="ts">
    import ConfirmDialog from "./ConfirmDialog.svelte";

    let { isOpen = $bindable(true), onConfirm, onCancel }: {
        isOpen?: boolean;
        onConfirm: () => void | boolean;
        onCancel?: () => void;
    } = $props();
</script>

<ConfirmDialog bind:isOpen {onConfirm} {onCancel} />
<span data-testid="is-open">{isOpen}</span>
