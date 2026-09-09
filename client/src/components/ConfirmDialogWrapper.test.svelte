<script lang="ts">
    import ConfirmDialog from "./ConfirmDialog.svelte";

    let { isOpen = $bindable(true), onConfirm, onCancel } = $props<{
        isOpen?: boolean;
        onConfirm?: () => void;
        onCancel?: () => void;
    }>();
</script>

<ConfirmDialog bind:isOpen {onConfirm} {onCancel} />
<span data-testid="is-open">{isOpen}</span>
