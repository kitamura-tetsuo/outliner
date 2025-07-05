<script lang="ts">
import { browser } from "$app/environment";
import {
    onDestroy,
    onMount,
} from "svelte";
import { userManager } from "../../auth/UserManager";
import { getLogger } from "../../lib/logger";
import { getFluidClientByProjectTitle } from "../../services";
import { fluidStore } from "../../stores/fluidStore.svelte";
import SearchBox from "../../components/SearchBox.svelte";

// プロジェクトレベルのレイアウト
// このレイアウトは /[project] と /[project]/[page] の両方に適用されます
let { data, children } = $props();

const logger = getLogger("ProjectLayout");

// URLパラメータを取得
let projectName = $state("");

// プロジェクト関連の状態
let project: any = $state(undefined);
let rootItems: any = $state(undefined);
let error: string | undefined = $state(undefined);
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
    error = undefined;
    projectNotFound = false;

    try {
        const projectName = data.project;

        // 既にfluidStoreにFluidClientが設定されている場合はそれを使用
        if (fluidStore.fluidClient) {
            logger.info(`既存のFluidClientを使用: ${projectName}`);
        }
        else {
            // プロジェクト名からFluidClientを取得
            logger.info(`プロジェクト名からFluidClientを取得: ${projectName}`);
            const client = await getFluidClientByProjectTitle(projectName);

            // fluidClientストアを更新
            fluidStore.fluidClient = client;
        }
    }
    catch (err) {
        console.error("Failed to load project:", err);
        error = err instanceof Error
            ? err.message
            : "プロジェクトの読み込み中にエラーが発生しました。";
        projectNotFound = true;
    }
    finally {
        isLoading = false;
    }
}

$effect(() => {
    if (isAuthenticated) {
        const client = fluidStore.fluidClient;
        if (client?.container) {
            project = client.getProject();
            rootItems = client.getTree();
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

{#if project}
    <SearchBox {project} />
{/if}
{@render children()}
