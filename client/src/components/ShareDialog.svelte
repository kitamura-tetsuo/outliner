<script lang="ts">
import { getLogger } from "../lib/logger";

const logger = getLogger("ShareDialog");

interface Props {
    isOpen?: boolean;
    projectTitle?: string;
    onclose?: () => void;
}

let { isOpen = $bindable(false), projectTitle = "", onclose }: Props = $props();

let activeTab = $state("link");
let shareLink = $state("");
let selectedPermission = $state("edit");
let isGeneratingLink = $state(false);
let showSuccessMessage = $state(false);
let inviteEmail = $state("");
let sharedUsers = $state([
    { id: "1", name: "User 1", email: "user1@example.com", permission: "edit" },
    { id: "2", name: "User 2", email: "user2@example.com", permission: "readonly" },
]);

function closeDialog() {
    if (onclose) onclose();
}

async function generateShareLink() {
    isGeneratingLink = true;
    try {
        // 実際の実装では、APIを呼び出してリンクを生成
        await new Promise(resolve => setTimeout(resolve, 1000));
        shareLink = `https://outliner.example.com/shared/${crypto.randomUUID()}`;
        showSuccessMessage = true;
        setTimeout(() => showSuccessMessage = false, 3000);
    }
    catch (error) {
        logger.error("Failed to generate share link:", error);
    }
    finally {
        isGeneratingLink = false;
    }
}

async function savePermissions() {
    try {
        // 実際の実装では、APIを呼び出して権限を保存
        await new Promise(resolve => setTimeout(resolve, 500));
        showSuccessMessage = true;
        setTimeout(() => showSuccessMessage = false, 3000);
    }
    catch (error) {
        logger.error("Failed to save permissions:", error);
    }
}

async function sendInvite() {
    if (!inviteEmail) return;

    try {
        // 実際の実装では、APIを呼び出して招待を送信
        await new Promise(resolve => setTimeout(resolve, 500));
        inviteEmail = "";
        showSuccessMessage = true;
        setTimeout(() => showSuccessMessage = false, 3000);
    }
    catch (error) {
        logger.error("Failed to send invite:", error);
    }
}

async function revokeAccess() {
    try {
        // 実際の実装では、APIを呼び出してアクセスを取り消し
        await new Promise(resolve => setTimeout(resolve, 500));
        shareLink = "";
        showSuccessMessage = true;
        setTimeout(() => showSuccessMessage = false, 3000);
    }
    catch (error) {
        logger.error("Failed to revoke access:", error);
    }
}

function changeUserPermission(userId: string, newPermission: string) {
    const user = sharedUsers.find(u => u.id === userId);
    if (user) {
        user.permission = newPermission;
        sharedUsers = [...sharedUsers];
        showSuccessMessage = true;
        setTimeout(() => showSuccessMessage = false, 3000);
    }
}
</script>

{#if isOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" data-testid="share-dialog">
        <div class="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-xl font-bold">プロジェクトを共有</h2>
                <button onclick={closeDialog} class="text-gray-500 hover:text-gray-700">
                    ✕
                </button>
            </div>

            {#if projectTitle}
                <p class="mb-4 text-gray-600" data-testid="project-title">プロジェクト: {projectTitle}</p>
            {/if}

            <!-- タブナビゲーション -->
            <div class="mb-6 border-b">
                <nav class="flex space-x-8">
                    <button
                        class="border-b-2 py-2 px-1 text-sm font-medium {activeTab === 'link' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                        onclick={() => activeTab = "link"}
                    >
                        共有リンク
                    </button>
                    <button
                        class="border-b-2 py-2 px-1 text-sm font-medium {activeTab === 'users' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                        onclick={() => activeTab = "users"}
                        data-testid="invite-users-tab"
                    >
                        ユーザー招待
                    </button>
                    <button
                        class="border-b-2 py-2 px-1 text-sm font-medium {activeTab === 'manage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                        onclick={() => activeTab = "manage"}
                        data-testid="manage-users-tab"
                    >
                        ユーザー管理
                    </button>
                    <button
                        class="border-b-2 py-2 px-1 text-sm font-medium {activeTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
                        onclick={() => activeTab = "history"}
                        data-testid="sharing-history-tab"
                    >
                        共有履歴
                    </button>
                </nav>
            </div>

            <!-- 成功メッセージ -->
            {#if showSuccessMessage}
                <div class="mb-4 rounded-md bg-green-50 p-4" data-testid="permissions-saved-message">
                    <div class="text-sm text-green-800">設定が保存されました</div>
                </div>
            {/if}

            <!-- タブコンテンツ -->
            {#if activeTab === "link"}
                <div class="space-y-4">
                    <!-- 権限設定 -->
                    <div data-testid="permission-settings">
                        <h3 class="mb-2 text-lg font-medium">アクセス権限</h3>
                        <div class="space-y-2">
                            <label class="flex items-center">
                                <input
                                    type="radio"
                                    bind:group={selectedPermission}
                                    value="readonly"
                                    class="mr-2"
                                    data-testid="permission-readonly"
                                />
                                読み取り専用
                            </label>
                            <label class="flex items-center">
                                <input
                                    type="radio"
                                    bind:group={selectedPermission}
                                    value="edit"
                                    class="mr-2"
                                    data-testid="permission-edit"
                                />
                                編集可能
                            </label>
                            <label class="flex items-center">
                                <input
                                    type="radio"
                                    bind:group={selectedPermission}
                                    value="admin"
                                    class="mr-2"
                                    data-testid="permission-admin"
                                />
                                管理者
                            </label>
                        </div>
                        <button
                            onclick={savePermissions}
                            class="mt-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                            data-testid="save-permissions-button"
                        >
                            権限を保存
                        </button>
                    </div>

                    <!-- 共有リンク生成 -->
                    <div>
                        <button
                            onclick={generateShareLink}
                            disabled={isGeneratingLink}
                            class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
                            data-testid="generate-share-link-button"
                        >
                            {isGeneratingLink ? "生成中..." : "共有リンクを生成"}
                        </button>
                    </div>

                    <!-- 生成された共有リンク -->
                    {#if shareLink}
                        <div>
                            <label class="block text-sm font-medium text-gray-700">共有リンク</label>
                            <input
                                type="text"
                                readonly
                                value={shareLink}
                                class="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 px-3 py-2"
                                data-testid="share-link-input"
                            />
                            <button
                                onclick={revokeAccess}
                                class="mt-2 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                                data-testid="revoke-access-button"
                            >
                                アクセスを取り消し
                            </button>
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "users"}
                <div class="space-y-4">
                    <h3 class="text-lg font-medium">ユーザーを招待</h3>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">メールアドレス</label>
                        <input
                            type="email"
                            bind:value={inviteEmail}
                            placeholder="user@example.com"
                            class="mt-1 block w-full rounded-md border-gray-300 px-3 py-2"
                            data-testid="invite-email-input"
                        />
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">権限</label>
                        <select
                            class="mt-1 block w-full rounded-md border-gray-300 px-3 py-2"
                            data-testid="invite-permission-select"
                        >
                            <option value="readonly">読み取り専用</option>
                            <option value="edit">編集可能</option>
                            <option value="admin">管理者</option>
                        </select>
                    </div>
                    <button
                        onclick={sendInvite}
                        class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
                        data-testid="send-invite-button"
                    >
                        招待を送信
                    </button>
                    {#if showSuccessMessage}
                        <div class="text-green-600" data-testid="invite-sent-message">招待が送信されました</div>
                    {/if}
                </div>
            {:else if activeTab === "manage"}
                <div class="space-y-4">
                    <h3 class="text-lg font-medium">共有ユーザー管理</h3>
                    <div data-testid="shared-users-list">
                        {#each sharedUsers as user (user.id)}
                            <div class="flex items-center justify-between border-b py-2" data-testid="user-item">
                                <div>
                                    <div class="font-medium">{user.name}</div>
                                    <div class="text-sm text-gray-500">{user.email}</div>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <select
                                        value={user.permission}
                                        onchange={e =>
                                        changeUserPermission(
                                            user.id,
                                            (e.target as HTMLSelectElement)?.value || "",
                                        )}
                                        class="rounded border-gray-300 px-2 py-1 text-sm"
                                        data-testid="permission-select"
                                    >
                                        <option value="readonly">読み取り専用</option>
                                        <option value="edit">編集可能</option>
                                        <option value="admin">管理者</option>
                                    </select>
                                    <button
                                        onclick={() => changeUserPermission(user.id, user.permission)}
                                        class="rounded bg-blue-500 px-2 py-1 text-sm text-white hover:bg-blue-600"
                                        data-testid="change-permission-button"
                                    >
                                        変更
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                    {#if showSuccessMessage}
                        <div class="text-green-600" data-testid="permission-updated-message">権限が更新されました</div>
                    {/if}
                </div>
            {:else if activeTab === "history"}
                <div class="space-y-4">
                    <h3 class="text-lg font-medium">共有履歴</h3>
                    <div data-testid="sharing-history-list">
                        <div class="space-y-2">
                            <div class="border-b py-2" data-testid="history-item">
                                <div class="text-sm">2024-01-15 10:30 - 共有リンクを生成</div>
                            </div>
                            <div class="border-b py-2" data-testid="history-item">
                                <div class="text-sm">2024-01-14 15:20 - user1@example.com を招待</div>
                            </div>
                            <div class="border-b py-2" data-testid="history-item">
                                <div class="text-sm">2024-01-13 09:15 - プロジェクトを作成</div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- アクセス取り消し確認ダイアログ -->
            {#if showSuccessMessage}
                <div class="mt-4 text-green-600" data-testid="access-revoked-message">
                    アクセスが取り消されました
                </div>
            {/if}
        </div>
    </div>

    <!-- 確認ダイアログ -->
    <div class="hidden" data-testid="confirm-revoke-button">
        <!-- 実際の確認ダイアログは必要に応じて実装 -->
    </div>
{/if}
