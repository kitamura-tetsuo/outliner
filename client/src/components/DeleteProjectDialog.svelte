<script lang="ts">
    interface Props {
        projectTitle: string;
        onConfirm: () => void;
        onCancel: () => void;
    }

    let { projectTitle, onConfirm, onCancel }: Props = $props();

    // モーダル背景 클릭 시 닫기
    function handleBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            onCancel();
        }
    }

    // キーボードイベント処理（Escキーで閉じる）
    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onCancel();
        }
    }
</script>

<!-- モーダル背景 -->
<div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    onclick={handleBackdropClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
    tabindex="-1"
>
    <!-- モーダルコンテンツ -->
    <div class="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="dialog-title" class="mb-4 text-xl font-semibold text-gray-900">
            プロジェクトの完全削除
        </h2>

        <div class="mb-6">
            <p class="mb-4 text-gray-700">
                プロジェクト "<span class="font-semibold">{projectTitle}</span>" を完全に削除しますか？
            </p>
            <div class="rounded-md bg-red-50 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg
                            class="h-5 w-5 text-red-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-800">
                            この操作は取り消すことができません
                        </h3>
                        <div class="mt-2 text-sm text-red-700">
                            <p>
                                プロジェクトは完全に削除され、復元することはできません。プロジェクトに関連するすべてのデータ（コンテンツ、添付ファイル、コメントなど）が失われます。
                            </p>
                            <p class="mt-2">
                                なお、プロジェクトは削除後も30日間はサーバーに保持され、その後自動的にパージされます。
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex justify-end space-x-3">
            <button
                type="button"
                onclick={onCancel}
                class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
                キャンセル
            </button>
            <button
                type="button"
                onclick={onConfirm}
                class="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
                完全に削除
            </button>
        </div>
    </div>
</div>

<style>
    /* スタイリングが必要な場合は追加 */
</style>
