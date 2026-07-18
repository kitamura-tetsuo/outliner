<script lang="ts">
let {
    isOpen = $bindable(false),
    title = "Confirm",
    message = "Are you sure?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    isDestructive = false
} = $props<{
    isOpen?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    isDestructive?: boolean;
}>();

let dialogElement: HTMLDialogElement;
const dialogId = Math.random().toString(36).substring(2, 9);

$effect(() => {
    if (dialogElement) {
        if (isOpen) {
            dialogElement.showModal();
        } else {
            dialogElement.close();
        }
    }
});

function handleConfirm() {
    isOpen = false;
    onConfirm();
}

function handleCancel() {
    isOpen = false;
    if (onCancel) onCancel();
}
</script>

<dialog
    bind:this={dialogElement}
    onclose={handleCancel}
    class="backdrop:bg-black backdrop:bg-opacity-50 p-0 rounded-lg shadow-xl border border-gray-200"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby={`confirm-dialog-title-${dialogId}`}
    aria-describedby={`confirm-dialog-message-${dialogId}`}
>
    <div class="bg-white rounded-lg max-w-sm w-full" onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} onpointerdown={(e) => e.stopPropagation()} onmouseup={(e) => e.stopPropagation()} role="presentation">
        <div class="p-4 sm:p-6">
            <h3 id={`confirm-dialog-title-${dialogId}`} class="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p id={`confirm-dialog-message-${dialogId}`} class="text-sm text-gray-600 mb-6">{message}</p>

            <div class="flex justify-end gap-3">
                <button
                    type="button"
                    class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onclick={handleCancel}
                >
                    {cancelText}
                </button>
                <button
                    type="button"
                    class="px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 {isDestructive ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}"
                    onclick={handleConfirm}
                >
                    {confirmText}
                </button>
            </div>
        </div>
    </div>
</dialog>

<style>
    dialog::backdrop {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>
