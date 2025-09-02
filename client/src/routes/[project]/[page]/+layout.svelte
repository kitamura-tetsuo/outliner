<script lang="ts">
import { page } from "$app/state";

import { getLogger } from "../../../lib/logger";
import { Item } from "../../../schema/app-schema";
import { fluidStore } from "../../../stores/fluidStore.svelte";
import { store } from "../../../stores/store.svelte";

const logger = getLogger("PageLayout");

// ページレベルのレイアウト
// このレイアウトは /[project]/[page] に適用されます
let { children } = $props();

// URLパラメータを取得
let projectName = page.params.project;
let pageName = page.params.page;



// デバッグ用ログ
logger.info(`Page layout initialized with params: project="${projectName}", page="${pageName}"`);

/**
 * ページ名からページを検索する
 */
function findPageByName(name: string) {
    if (!store.pages) return undefined;

    logger.info(`Searching for page: "${name}"`);

    // ページ名が一致するページを検索（Yjs Items に対応）
    const arr: any = store.pages.current as any;
    const len = arr?.length ?? 0;
    for (let i = 0; i < len; i++) {
        const page = arr?.at ? arr.at(i) : arr[i];
        if (!page) continue;
        const title = (page.text as any)?.toString?.() ?? String((page as any).text ?? "");
        logger.info(`Checking page: "${title}" against "${name}"`);
        if (title.toLowerCase() === name.toLowerCase()) {
            logger.info(`Found matching page: "${title}"`);
            return page;
        }
    }

    logger.info(`No matching page found for: "${name}"`);
    return undefined;
}

/**
 * 仮ページ用の一時的なアイテムを作成する
 * このアイテムはSharedTreeには追加されない
 * @param pageName ページ名
 * @returns 一時的なアイテム
 */
function createTemporaryItem(pageName: string): Item {
    const currentUser = fluidStore.currentUser?.id || "anonymous";
    logger.info(`Creating temporary item for page: ${pageName}, user: ${currentUser}`);

    if (!store.project) {
        throw new Error("Project is not loaded");
    }
    const list: any = store.project.items as any;
    const newPage: Item = list.addNode(currentUser);
    newPage.updateText(pageName);

    logger.info(`Created new page with ID: ${newPage.id}`);
    return newPage;
}

/**
 * currentPageを設定する
 */
async function setCurrentPage() {
    logger.info(`setCurrentPage: Starting for project="${projectName}", page="${pageName}"`);

    if (!projectName || !pageName) {
        logger.info(`setCurrentPage: Missing parameters - project: ${!!projectName}, page: ${!!pageName}`);
        return;
    }

    try {
        // プロジェクトが読み込まれるまで待つ
        let retryCount = 0;
        const maxRetries = 20;
        while (!store.project && retryCount < maxRetries) {
            logger.info(`Waiting for store.project to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            retryCount++;
        }

        // store.pagesの設定も待つ
        retryCount = 0;
        while (!store.pages && retryCount < maxRetries) {
            logger.info(`Waiting for store.pages to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            retryCount++;
        }

        if (store.pages) {
            logger.info(`setCurrentPage: Found ${store.pages.current.length} pages`);

            // デバッグ用：利用可能なページをログ出力（Yjs Items に対応）
            {
                const arr: any = store.pages.current as any;
                const len = arr?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = arr?.at ? arr.at(i) : arr[i];
                    const title = (p?.text as any)?.toString?.() ?? String((p as any)?.text ?? "");
                    logger.info(`Page ${i}: "${title}"`);
                }
            }

            const foundPage = findPageByName(pageName);
            if (foundPage) {
                // 既存のページが見つかった場合
                store.currentPage = foundPage;
                logger.info(`Found existing page: ${pageName}`);
                logger.info(
                    `store.currentPage set to existing page: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                );

                // 設定が確実に反映されるように少し待つ
                await new Promise(resolve => setTimeout(resolve, 50));
                logger.info(
                    `After timeout - store.currentPage: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                );

                // さらに強制的に設定し直す（setProjectによる上書きを防ぐため）
                if (store.currentPage?.id !== foundPage.id) {
                    logger.info(`Forcing currentPage reset due to mismatch`);
                    store.currentPage = foundPage;
                    logger.info(
                        `After force reset - store.currentPage: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                    );
                }
            }
            else {
                // プロジェクトは存在するが、ページが存在しない場合は仮ページを作成
                const tempItem = createTemporaryItem(pageName);
                store.currentPage = tempItem;

                logger.info(`Creating temporary page: ${pageName}`);
                logger.info(
                    `store.currentPage set to temporary page: ${store.currentPage?.text}, id: ${store.currentPage?.id}`,
                );
            }
        }
        else {
            logger.error("No pages available - store.pages is null/undefined");
            logger.error(`store.project exists: ${!!store.project}`);
        }
    }
    catch (error) {
        logger.error(`Failed to set current page: ${String(error)}`);
    }
}





// URLパラメータが変更されたときにcurrentPageを設定
$effect(() => {
    logger.info(`Effect triggered: project=${projectName}, page=${pageName}`);
    // store.project / store.pages の変化でも再実行されるよう、参照しておく
    const projReady = !!store.project;
    const pagesReady = !!store.pages;

    if (projectName && pageName && projReady && pagesReady) {
        setCurrentPage();
    } else {
        logger.info(
            `Effect: Waiting conditions - projectName=${!!projectName}, pageName=${!!pageName}, projReady=${projReady}, pagesReady=${pagesReady}`,
        );
    }
});
</script>

{@render children()}
