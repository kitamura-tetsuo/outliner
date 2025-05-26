<script lang="ts">
    import { browser } from "$app/environment";
    import { onDestroy, onMount } from "svelte";
    import { UserManager } from "../../auth/UserManager";
    import { getLogger } from "../../lib/logger";
    import { fluidStore } from "../../stores/fluidStore.svelte";
    import { getFluidClientByProjectTitle } from "../../services";
    import { setupGlobalDebugFunctions } from "../../lib/debug";

    // プロジェクトレベルのレイアウト
    // このレイアウトは /[project] と /[project]/[page] の両方に適用されます
    let { data, children } = $props();

    const logger = getLogger("ProjectLayout");

    // URLパラメータを取得
    let projectName = $state("");

    // プロジェクト関連の状態
    let project: any = $state(null);
    let rootItems: any = $state(null);
    let error: string | null = $state(null);
    let isLoading = $state(true);
    let isAuthenticated = $state(false);
    let projectNotFound = $state(false);

    // URLパラメータを監視して更新
    $effect(() => {
        // SvelteKit 2.0では、dataオブジェクトからパラメータを取得
        if (data && data.project) {
            projectName = data.project;
        }

        logger.info(`Layout loading project: ${projectName}`);

        // プロジェクトが指定されている場合、データを読み込む
        if (projectName && isAuthenticated) {
            loadProject();
        }
    });

    // プロジェクトを読み込む
    async function loadProject() {
        isLoading = true;
        error = null;
        projectNotFound = false;

        try {
            const projectName = data.project;
            // プロジェクト名からFluidClientを取得
            logger.info(`プロジェクト名からFluidClientを取得: ${projectName}`);
            const client = await getFluidClientByProjectTitle(projectName);

            // fluidClientストアを更新
            fluidStore.fluidClient = client;
        } catch (err) {
            console.error("Failed to load project:", err);
            error =
                err instanceof Error
                    ? err.message
                    : "プロジェクトの読み込み中にエラーが発生しました。";
            projectNotFound = true;
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (isAuthenticated) {
            const client = fluidStore.fluidClient;
            if (client?.container) {
                project = client.getProject();
                rootItems = client.getTree();

                // デバッグ関数を初期化
                if (browser) {
                    // setupGlobalDebugFunctions(client);
                }
            }
        }
    });

    onMount(() => {
        // UserManagerの認証状態を確認

        isAuthenticated = userManager.getCurrentUser() !== null;
    });

    onDestroy(() => {
        // クリーンアップコード
    });
</script>

{@render children()}
