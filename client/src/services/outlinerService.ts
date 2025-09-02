/**
 * Outliner統合サービス
 * Yjsモード専用
 */

import { getLogger } from "../lib/logger.js";
import { getCurrentMode, isFluidMode, isYjsMode } from "../lib/modeUtils";

const logger = getLogger("OutlinerService");

/**
 * プロジェクト情報の共通インターフェース
 */
export interface ProjectInfo {
    id: string;
    title: string;
    containerId?: string; // Fluidモードでのみ使用
}

/**
 * ページ情報の共通インターフェース
 */
export interface PageInfo {
    id: string;
    title: string;
    projectId: string;
}

/**
 * アイテム情報の共通インターフェース
 */
export interface ItemInfo {
    id: string;
    text: string;
    pageId: string;
    parentId?: string;
}

/**
 * Outliner統合サービスクラス
 * Yjsモード専用
 */
export class OutlinerService {
    /**
     * 新しいプロジェクトを作成
     */
    static async createProject(projectName: string): Promise<ProjectInfo> {
        logger.info(`Creating project "${projectName}" in Yjs mode`);

        // Yjsモード専用の処理
        const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
        const projectId = crypto.randomUUID();
        const yjsProjectManager = new YjsProjectManager(projectId);
        await yjsProjectManager.connect(projectName);

        return {
            id: projectId,
            title: projectName,
        };
    }

    /**
     * プロジェクトを読み込み
     */
    static async loadProject(projectIdentifier: string): Promise<ProjectInfo | null> {
        const mode = getCurrentMode();
        logger.info(`Loading project "${projectIdentifier}" in ${mode} mode`);

        if (isFluidMode()) {
            // Fluidモードでの処理
            const { getFluidClientByProjectTitle } = await import("../lib/fluidService.svelte.js");
            try {
                const fluidClient = await getFluidClientByProjectTitle(projectIdentifier);
                if (!fluidClient) throw new Error("Fluid client not found");
                return {
                    id: String((fluidClient as any).containerId),
                    title: String((fluidClient as any).project?.title ?? projectIdentifier),
                    containerId: String((fluidClient as any).containerId),
                };
            } catch (error) {
                logger.error(`Failed to load Fluid project: ${error}`);
                return null;
            }
        } else {
            // Yjsモードでの処理
            const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
            try {
                const yjsProjectManager = new YjsProjectManager(projectIdentifier);
                await yjsProjectManager.connect();
                const metadata = yjsProjectManager.getProjectMetadata();

                return {
                    id: projectIdentifier,
                    title: metadata?.title || projectIdentifier,
                };
            } catch (error) {
                logger.error(`Failed to load Yjs project: ${error}`);
                return null;
            }
        }
    }

    /**
     * 新しいページを作成
     */
    static async createPage(projectId: string, pageTitle: string, author: string): Promise<PageInfo> {
        const mode = getCurrentMode();
        logger.info(`Creating page "${pageTitle}" in project ${projectId} (${mode} mode)`);

        if (isFluidMode()) {
            // Fluidモードでの処理（Yjsブランチでは簡易実装に置き換え）
            const { fluidStore } = await import("../stores/fluidStore.svelte.js");

            const client = fluidStore.fluidClient;
            if (!client) {
                throw new Error("Fluid client not loaded");
            }
            const project = client.getProject();
            if (!project) {
                throw new Error("Fluid project not loaded");
            }

            const newPageId = (typeof crypto !== "undefined" && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${Date.now()}`;
            // 簡易的にプロジェクトへページ情報を追加
            try {
                (project.items as any[]).push({ id: newPageId, title: pageTitle, author });
            } catch {}

            return {
                id: String(newPageId),
                title: pageTitle,
                projectId: projectId,
            };
        } else {
            // Yjsモードでの処理
            const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
            const yjsProjectManager = new YjsProjectManager(projectId);
            await yjsProjectManager.connect();

            const pageId = await yjsProjectManager.createPage(pageTitle, author);

            return {
                id: pageId,
                title: pageTitle,
                projectId: projectId,
            };
        }
    }

    /**
     * 新しいアイテムを作成
     */
    static async createItem(pageId: string, text: string, author: string, parentId?: string): Promise<ItemInfo> {
        const mode = getCurrentMode();
        logger.info(`Creating item "${text}" in page ${pageId} (${mode} mode)`);

        if (isFluidMode()) {
            // Fluidモードでの処理は既存のFluidコードで実行
            // この関数は主にYjsモードでの統一的なアイテム作成に使用
            throw new Error("Fluid mode item creation should use existing Fluid classes directly");
        } else {
            // Yjsモードでの処理
            const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
            const projectId = pageId.split(":")[0]; // ページIDからプロジェクトIDを抽出（仮実装）
            const yjsProjectManager = new YjsProjectManager(projectId);
            await yjsProjectManager.connect();

            const treeManager = await yjsProjectManager.connectToPage(pageId);
            const itemId = treeManager.insertItem(text, author, parentId || "root");

            return {
                id: itemId,
                text: text,
                pageId: pageId,
                parentId: parentId,
            };
        }
    }

    /**
     * アイテムのテキストを更新
     */
    static async updateItemText(itemId: string, newText: string, pageId: string): Promise<void> {
        const mode = getCurrentMode();
        logger.info(`Updating item ${itemId} text to "${newText}" (${mode} mode)`);

        if (isFluidMode()) {
            // Fluidモードでの処理は既存のFluidコードで実行
            // この関数は主にYjsモードでの統一的なテキスト更新に使用
            logger.info("Fluid mode text update should use existing Fluid classes directly");
            return;
        } else {
            // Yjsモードでの処理
            const { YjsProjectManager } = await import("../lib/yjsProjectManager.svelte.js");
            const projectId = pageId.split(":")[0]; // ページIDからプロジェクトIDを抽出（仮実装）
            const yjsProjectManager = new YjsProjectManager(projectId);
            await yjsProjectManager.connect();

            const treeManager = await yjsProjectManager.connectToPage(pageId);
            treeManager.updateItemText(itemId, newText);
        }
    }

    /**
     * 現在のモードを取得
     */
    static getCurrentMode() {
        return getCurrentMode();
    }

    /**
     * モードが有効かチェック
     */
    static isFluidMode() {
        return isFluidMode();
    }

    static isYjsMode() {
        return isYjsMode();
    }
}
