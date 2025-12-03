<script lang="ts">
    import { onMount } from "svelte";
    import AuthComponent from "../../../components/AuthComponent.svelte";
    import { userManager } from "../../../auth/UserManager";
    import { listDeletedProjects, restoreProject, permanentlyDeleteProject } from "../../../services/projectService";
    import { getLogger } from "../../../lib/logger";
    import DeleteProjectDialog from "../../../components/DeleteProjectDialog.svelte";

    const logger = getLogger();

    let isAuthenticated = $state(false);
    let deletedProjects = $state<Array<{
        containerId: string;
        title: string;
        ownerId: string;
        deletedAt: Date | null;
        deletedBy: string;
        createdAt: Date | null;
        updatedAt: Date | null;
    }>>([]);

    let loading = $state(false);
    let error: string | undefined = $state(undefined);
    let success: string | undefined = $state(undefined);
    let showDeleteDialog = $state(false);
    let projectToDelete: { containerId: string; title: string } | null = $state(null);

    // 認証成功時の処理
    async function handleAuthSuccess(authResult) {
        logger.info("認証成功:", authResult);
        isAuthenticated = true;
        await loadDeletedProjects();
    }

    // 認証ログアウト時の処理
    function handleAuthLogout() {
        logger.info("ログアウトしました");
        isAuthenticated = false;
        deletedProjects = [];
    }

    // 削除されたプロジェクトを読み込む
    async function loadDeletedProjects() {
        loading = true;
        error = undefined;
        success = undefined;

        try {
            deletedProjects = await listDeletedProjects();
            logger.info(`Loaded ${deletedProjects.length} deleted projects`);
        } catch (err) {
            logger.error("Error loading deleted projects:", err);
            error = err instanceof Error ? err.message : "削除済みプロジェクトの読み込みに失敗しました";
        } finally {
            loading = false;
        }
    }

    // プロジェクトを復元
    async function handleRestore(containerId: string, title: string) {
        loading = true;
        error = undefined;
        success = undefined;

        try {
            const ok = await restoreProject(containerId);
            if (ok) {
                success = `プロジェクト "${title}" を復元しました`;
                await loadDeletedProjects(); // リストを更新
            } else {
                error = `プロジェクト "${title}" の復元に失敗しました`;
            }
        } catch (err) {
            logger.error("Error restoring project:", err);
            error = err instanceof Error ? err.message : `プロジェクト "${title}" の復元に失敗しました`;
        } finally {
            loading = false;
        }
    }

    // プロジェクトを完全に削除
    async function handlePermanentDelete(containerId: string, title: string) {
        loading = true;
        error = undefined;
        success = undefined;

        try {
            const ok = await permanentlyDeleteProject(containerId);
            if (ok) {
                success = `プロジェクト "${title}" を完全に削除しました`;
                await loadDeletedProjects(); // リストを更新
            } else {
                error = `プロジェクト "${title}" の完全削除に失敗しました`;
            }
        } catch (err) {
            logger.error("Error permanently deleting project:", err);
            error = err instanceof Error ? err.message : `プロジェクト "${title}" の完全削除に失敗しました`;
        } finally {
            loading = false;
        }
    }

    // 削除確認ダイアログを開く
    function openDeleteDialog(project: { containerId: string; title: string }) {
        projectToDelete = project;
        showDeleteDialog = true;
    }

    // 削除確認ダイアログで削除を実行
    async function confirmDelete() {
        if (projectToDelete) {
            await handlePermanentDelete(projectToDelete.containerId, projectToDelete.title);
            showDeleteDialog = false;
            projectToDelete = null;
        }
    }

    // 削除確認ダイアログをキャンセル
    function cancelDelete() {
        showDeleteDialog = false;
        projectToDelete = null;
    }

    onMount(() => {
        // UserManagerの認証状態を確認
        isAuthenticated = userManager.getCurrentUser() !== null;

        if (isAuthenticated) {
            loadDeletedProjects();
        }
    });

    // 日付フォーマット関数
    function formatDate(date: Date | null): string {
        if (!date) return "不明";
        return new Date(date).toLocaleString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<svelte:head>
    <title>ゴミ箱 - Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
    <h1 class="mb-6 text-center text-3xl font-bold">
        ゴミ箱
    </h1>

    <div class="auth-section mb-8">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    {#if isAuthenticated}
        <div class="mb-4 flex items-center justify-between">
            <p class="text-gray-600">
                削除されたプロジェクトを表示しています。復元または完全に削除できます。
            </p>
            <button
                onclick={loadDeletedProjects}
                disabled={loading}
                class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
                {loading ? "更新中..." : "更新"}
            </button>
        </div>

        {#if error}
            <div
                class="mb-4 rounded-md bg-red-100 p-3 text-red-700"
                role="alert"
            >
                {error}
            </div>
        {/if}

        {#if success}
            <div
                class="mb-4 rounded-md bg-green-100 p-3 text-green-700"
                role="alert"
            >
                {success}
            </div>
        {/if}

        {#if loading}
            <div class="text-center py-8">
                <p class="text-gray-600">読み込み中...</p>
            </div>
        {:else if deletedProjects.length > 0}
            <div class="overflow-hidden rounded-lg bg-white shadow">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                プロジェクト名
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                削除日時
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                削除者
                            </th>
                            <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                操作
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white">
                        {#each deletedProjects as project (project.containerId)}
                            <tr class="hover:bg-gray-50">
                                <td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                    {project.title}
                                </td>
                                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                    {formatDate(project.deletedAt)}
                                </td>
                                <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                    {project.deletedBy}
                                </td>
                                <td class="whitespace-nowrap px-6 py-4 text-sm">
                                    <div class="flex space-x-2">
                                        <button
                                            onclick={() => handleRestore(project.containerId, project.title)}
                                            disabled={loading}
                                            class="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                                        >
                                            復元
                                        </button>
                                        <button
                                            onclick={() => openDeleteDialog({ containerId: project.containerId, title: project.title })}
                                            disabled={loading}
                                            class="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                                        >
                                            完全削除
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <div class="rounded-lg bg-white p-8 text-center shadow">
                <p class="text-gray-500">削除されたプロジェクトはありません</p>
            </div>
        {/if}
    {:else}
        <div class="mx-auto max-w-md rounded-lg bg-yellow-50 p-6 shadow-md">
            <h2 class="mb-2 text-xl font-semibold">認証が必要です</h2>
            <p class="mb-4 text-gray-700">
                ゴミ箱を表示するには、まず上部のログインボタンからログインしてください。
            </p>
        </div>
    {/if}

    <div class="mt-6 text-center">
        <a
            href="/projects"
            class="rounded-md px-2 py-1 text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
            プロジェクト一覧に戻る
        </a>
    </div>
</main>

{#if showDeleteDialog && projectToDelete}
    <DeleteProjectDialog
        projectTitle={projectToDelete.title}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
    />
{/if}

<style>
    /* スタイリングが必要な場合は追加 */
</style>
