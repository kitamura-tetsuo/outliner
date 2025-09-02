/**
 * Yjs専用のOutlinerサービス
 * Fluidのクラスとは完全に独立して動作する
 */

import { getLogger } from "../lib/logger.js";
import type { ItemInfo, PageInfo, ProjectInfo } from "./outlinerService";

const logger = getLogger("YjsOutlinerService");

/**
 * Yjs専用のOutlinerサービスクラス
 * Fluidのクラスやデータとはまったく独立して動作する
 */
export class YjsOutlinerService {
    private static projectManagers = new Map<string, any>(); // YjsProjectManagerのインスタンスキャッシュ

    /**
     * YjsProjectManagerを取得または作成
     */
    private static async getProjectManager(projectId: string) {
        if (this.projectManagers.has(projectId)) {
            return this.projectManagers.get(projectId);
        }

        const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
        const manager = new YjsProjectManager(projectId);
        this.projectManagers.set(projectId, manager);
        return manager;
    }

    /**
     * 新しいプロジェクトを作成
     */
    static async createProject(projectName: string): Promise<ProjectInfo> {
        logger.info(`Creating Yjs project: "${projectName}"`);

        const projectId = crypto.randomUUID();
        const manager = await this.getProjectManager(projectId);
        await manager.connect(projectName);

        // WebSocket接続完了を待つ
        const connectionEstablished = await manager.waitForConnection(5000);
        if (connectionEstablished) {
            logger.info(`Yjs project created and connected: "${projectName}"`);
        } else {
            logger.warn(`WebSocket connection timeout for project: ${projectName}`);
        }

        return {
            id: projectId,
            title: projectName,
        };
    }

    /**
     * プロジェクトを読み込み
     */
    static async loadProject(projectId: string): Promise<ProjectInfo | null> {
        logger.info(`Loading Yjs project: ${projectId}`);

        try {
            const manager = await this.getProjectManager(projectId);
            await manager.connect();

            const metadata = manager.getProjectMetadata();
            if (!metadata) {
                logger.warn(`Project metadata not found: ${projectId}`);
                return null;
            }

            return {
                id: projectId,
                title: metadata.title,
            };
        } catch (error) {
            logger.error(`Failed to load Yjs project ${projectId}:`, error);
            return null;
        }
    }

    /**
     * プロジェクトのタイトルを更新
     */
    static async updateProjectTitle(projectId: string, newTitle: string): Promise<void> {
        logger.info(`Updating Yjs project title: ${projectId} -> "${newTitle}"`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();
        manager.updateProjectTitle(newTitle);
    }

    /**
     * 新しいページを作成
     */
    static async createPage(
        projectId: string,
        pageTitle: string,
        author: string,
        lines: string[] = [],
    ): Promise<PageInfo> {
        logger.info(`Creating Yjs page: "${pageTitle}" in project ${projectId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const pageId = await manager.createPage(pageTitle, author, lines);

        return {
            id: pageId,
            title: pageTitle,
            projectId: projectId,
        };
    }

    /**
     * ページのタイトルを更新
     */
    static async updatePageTitle(projectId: string, pageId: string, newTitle: string): Promise<void> {
        logger.info(`Updating Yjs page title: ${pageId} -> "${newTitle}"`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();
        await manager.updatePageTitle(pageId, newTitle);
    }

    /**
     * ページを削除
     */
    static async deletePage(projectId: string, pageId: string): Promise<void> {
        logger.info(`Deleting Yjs page: ${pageId} from project ${projectId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();
        await manager.deletePage(pageId);
    }

    /**
     * プロジェクト内のページ一覧を取得
     */
    static async getPages(projectId: string): Promise<PageInfo[]> {
        logger.info(`Getting Yjs pages for project: ${projectId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const pages = manager.getPages();
        return pages.map((page: { id: string; title: string; }) => ({
            id: page.id,
            title: page.title,
            projectId: projectId,
        }));
    }

    /**
     * 新しいアイテムを作成
     */
    static async createItem(
        projectId: string,
        pageId: string,
        text: string,
        author: string,
        parentId?: string,
    ): Promise<ItemInfo> {
        logger.info(`Creating Yjs item: "${text}" in page ${pageId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const treeManager = await manager.connectToPage(pageId);
        const itemId = treeManager.insertItem(text, author, parentId || "root");

        return {
            id: itemId,
            text: text,
            pageId: pageId,
            parentId: parentId,
        };
    }

    /**
     * アイテムのテキストを更新
     */
    static async updateItemText(projectId: string, pageId: string, itemId: string, newText: string): Promise<void> {
        logger.info(`Updating Yjs item text: ${itemId} -> "${newText}"`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const treeManager = await manager.connectToPage(pageId);
        treeManager.updateItemText(itemId, newText);
    }

    /**
     * アイテムを削除
     */
    static async deleteItem(projectId: string, pageId: string, itemId: string): Promise<void> {
        logger.info(`Deleting Yjs item: ${itemId} from page ${pageId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const treeManager = await manager.connectToPage(pageId);
        treeManager.removeItem(itemId);
    }

    /**
     * アイテムを移動
     */
    static async moveItem(
        projectId: string,
        pageId: string,
        itemId: string,
        newParentId: string,
        newIndex?: number,
    ): Promise<void> {
        logger.info(`Moving Yjs item: ${itemId} to parent ${newParentId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const treeManager = await manager.connectToPage(pageId);
        treeManager.moveItem(itemId, newParentId, newIndex);
    }

    /**
     * ページ内のアイテム一覧を取得
     */
    static async getPageItems(projectId: string, pageId: string): Promise<ItemInfo[]> {
        logger.info(`Getting Yjs items for page: ${pageId}`);

        const manager = await this.getProjectManager(projectId);
        await manager.connect();

        const treeManager = await manager.connectToPage(pageId);
        const items = treeManager.getAllItems();

        return items.map((item: { id: string; text?: string; parentId?: string; }) => ({
            id: item.id,
            text: item.text || "",
            pageId: pageId,
            parentId: item.parentId,
        }));
    }

    /**
     * プロジェクトマネージャーのキャッシュをクリア
     */
    static clearCache(): void {
        logger.info("Clearing Yjs project manager cache");
        this.projectManagers.clear();
    }

    /**
     * 特定のプロジェクトマネージャーを取得（デバッグ用）
     */
    static getProjectManagerForDebug(projectId: string) {
        return this.projectManagers.get(projectId);
    }
}
