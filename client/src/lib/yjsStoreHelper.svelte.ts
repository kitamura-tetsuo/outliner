// YjsProjectManagerとSvelteストアの連携ヘルパー
import { Item } from "../schema/app-schema";
import { store } from "../stores/store.svelte";
import { getLogger } from "./logger";
import { YjsProjectManager } from "./yjsProjectManager.svelte";

const logger = getLogger("YjsStoreHelper");

/**
 * YjsProjectManagerからSvelteストアを初期化
 */
export async function initializeStoreFromYjs(
    yjsProjectManager: YjsProjectManager,
    pageId?: string,
): Promise<void> {
    try {
        logger.info("Initializing Svelte store from Yjs data");

        // プロジェクトデータを取得してストアに設定（同期完了まで待機）
        let project = yjsProjectManager.getProject();
        if (!project) {
            const maxRetries = 50; // 最大約10秒
            let attempt = 0;
            while (!project && attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 200));
                project = yjsProjectManager.getProject();
                attempt++;
                if (attempt % 5 === 0) {
                    logger.info(`Waiting for project metadata... (${attempt}/${maxRetries})`);
                }
            }
        }

        if (project) {
            logger.info(`Setting project in store: ${project.title}`);
            store.project = project;

            // TreeSubscriberの値を手動更新
            if (store.pages) {
                store.pages.updateValue();
            }
        } else {
            logger.warn("Failed to get project from YjsProjectManager after retries");
            return;
        }

        // 指定されたページがある場合は、currentPageを設定（認証/接続待機を考慮してリトライ）
        if (pageId) {
            logger.info(`Setting current page: ${pageId}`);
            const maxRetries = 50; // 50 * 200ms = 10s
            let attempt = 0;
            let pageItem: Item | null = null;
            while (attempt < maxRetries && !pageItem) {
                try {
                    pageItem = await yjsProjectManager.getPageItem(pageId);
                } catch (e) {
                    // noop, retry
                }
                if (!pageItem) {
                    await new Promise(r => setTimeout(r, 200));
                    attempt++;
                    if (attempt % 5 === 0) {
                        logger.info(`Waiting for page item... (${attempt}/${maxRetries})`);
                    }
                }
            }

            if (pageItem) {
                store.currentPage = pageItem;
                logger.info(`Current page set: ${pageItem.text}`);
            } else {
                logger.warn(
                    `Failed to get full page item for pageId after retries: ${pageId}. Trying project pages index...`,
                );
                // フォールバック: プロジェクトのページ一覧からタイトル一致でページItemを取得
                if (store.pages?.current && store.pages.current.length > 0) {
                    const candidate = store.pages.current.find(p => p.text === pageId);
                    if (candidate) {
                        store.currentPage = candidate;
                        logger.info(`Fallback succeeded using project pages index. currentPage.id=${candidate.id}`);
                    } else {
                        logger.warn(`No matching page found in project pages index for title: ${pageId}`);
                    }
                } else {
                    logger.warn(`store.pages is empty or undefined, cannot use project pages index`);
                }
            }
        }

        logger.info("Store initialization completed");
    } catch (error) {
        logger.error("Failed to initialize store from Yjs:", error as any);
        throw error;
    }
}

/**
 * YjsProjectManagerを作成してストアを初期化
 */
export async function createYjsProjectAndInitializeStore(
    projectId: string,
    projectTitle?: string,
    pageId?: string,
): Promise<YjsProjectManager> {
    try {
        logger.info(`Creating Yjs project manager for: ${projectId}`);

        // YjsProjectManagerを作成
        const yjsProjectManager = new YjsProjectManager(projectId);
        await yjsProjectManager.connect(projectTitle);

        // ストアを初期化
        await initializeStoreFromYjs(yjsProjectManager, pageId);

        return yjsProjectManager;
    } catch (error) {
        logger.error("Failed to create Yjs project and initialize store:", error as any);
        throw error;
    }
}

/**
 * 既存のYjsProjectManagerからストアを更新
 */
export async function updateStoreFromYjs(
    yjsProjectManager: YjsProjectManager,
    pageId?: string,
): Promise<void> {
    try {
        logger.info("Updating Svelte store from Yjs data");

        // プロジェクトデータを更新
        const project = yjsProjectManager.getProject();
        if (project) {
            store.project = project;

            // TreeSubscriberの値を手動更新
            if (store.pages) {
                store.pages.updateValue();
            }
        }

        // ページデータを更新
        if (pageId) {
            const pageItem = await yjsProjectManager.getPageItem(pageId);
            if (pageItem) {
                store.currentPage = pageItem;
            }
        }

        logger.info("Store update completed");
    } catch (error) {
        logger.error("Failed to update store from Yjs:", error as any);
        throw error;
    }
}
