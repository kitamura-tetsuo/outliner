<script lang="ts">
import { page } from "$app/state";

import { v4 as uuid } from "uuid";
import { getLogger } from "../../../lib/logger";
import { Item, Items } from "@common/schema/app-schema";
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

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        logger.info(`Checking page: "${page.text}" against "${name}"`);
        if (page.text.toLowerCase() === name.toLowerCase()) {
            logger.info(`Found matching page: "${page.text}"`);
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
    const timeStamp = new Date().getTime();
    const currentUser = fluidStore.currentUser?.id || "anonymous";

    logger.info(`Creating temporary item for page: ${pageName}, user: ${currentUser}`);

    // 一時的なアイテムを作成
    const tempItem = new Item({
        id: `temp-${uuid()}`,
        text: pageName,
        author: currentUser,
        votes: [],
        created: timeStamp,
        lastChanged: timeStamp,
        // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
        items: new Items([]), // 子アイテムのための空のリスト
    });

    logger.info(`Created temporary item with ID: ${tempItem.id}`);
    return tempItem;
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

            // デバッグ用：利用可能なページをログ出力
            for (let i = 0; i < store.pages.current.length; i++) {
                const page = store.pages.current[i];
                logger.info(`Page ${i}: "${page.text}"`);
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
        logger.error("Failed to set current page:", error);
    }
}





// URLパラメータが変更されたときにcurrentPageを設定
$effect(() => {
    logger.info(`Effect triggered: project=${projectName}, page=${pageName}`);

    if (projectName && pageName) {
        setCurrentPage();
    }
});
</script>

{@render children()}
