<script lang="ts">
    interface Props {
        isOpen: boolean;
        title?: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        danger?: boolean;
        onConfirm: () => void;
        onCancel: () => void;
    }

    let {
        isOpen = $bindable(),
        title = "Confirm",
        message,
        confirmText = "Confirm",
        cancelText = "Cancel",
        danger = false,
        onConfirm,
        onCancel,
    }: Props = $props();

    let dialogElement: HTMLDialogElement;

    $effect(() => {
        if (dialogElement) {
            if (isOpen && !dialogElement.open) {
                dialogElement.showModal();
            } else if (!isOpen && dialogElement.open) {
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
        onCancel();
    }

    function preventClose(e: Event) {
        e.preventDefault();
        e.stopPropagation();
    }
</script>

<dialog
    bind:this={dialogElement}
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    aria-describedby="dialog-desc"
    oncancel={preventClose}
    onclose={handleCancel}
    onclick={(e) => { if (e.target === dialogElement) handleCancel(); }}
    class="backdrop:bg-black/50 p-0 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 max-w-md w-full"
>
    <div class="p-6">
        <h2 id="dialog-title" class="text-lg font-semibold mb-2">{title}</h2>
        <p id="dialog-desc" class="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
        <div class="flex justify-end gap-3">
            <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
                onclick={handleCancel}
            >
                {cancelText}
            </button>
            <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 {danger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}"
                onclick={handleConfirm}
            >
                {confirmText}
            </button>
        </div>
    </div>
</dialog>

<style>
    dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
    }
</style>
