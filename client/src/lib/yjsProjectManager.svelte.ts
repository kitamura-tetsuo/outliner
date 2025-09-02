// Yjs Project/Page データモデル管理
import { v4 as uuid } from "uuid";
import { Item, Items, Project } from "../schema/app-schema";
import { getLogger } from "./logger";
import { YjsOrderedTreeManager } from "./yjsOrderedTree";
import { type YjsConnection, yjsService } from "./yjsService.svelte";

const logger = getLogger();

export interface PageMetadata {
    id: string;
    title: string;
    createdAt: number;
    lastModified: number;
    order: number;
    author: string;
    deleted?: boolean;
}

export interface ProjectMetadata {
    id: string;
    title: string;
    createdAt: number;
    lastModified: number;
    author: string;
}

/**
 * Yjs Project管理クラス
 * Project = Y.Doc（ルート）として機能
 */
export class YjsProjectManager {
    private projectId: string;
    private projectConnection: YjsConnection | null = null;
    private pageConnections = new Map<string, YjsConnection>();
    private pageManagers = new Map<string, YjsOrderedTreeManager>();

    constructor(projectId: string) {
        this.projectId = projectId;
        logger.info(`YjsProjectManager initialized for project: ${projectId}`);
    }

    /**
     * プロジェクトに接続
     */
    async connect(initialTitle?: string): Promise<void> {
        try {
            this.projectConnection = await yjsService.createProjectConnection(this.projectId);

            // プロジェクトメタデータを初期化（存在しない場合）
            this.initializeProjectMetadata(initialTitle);

            logger.info(`Connected to project: ${this.projectId}`);
        } catch (error) {
            logger.error("Failed to connect to project:", error as any);
            throw error;
        }
    }

    /**
     * YjsデータからProjectオブジェクトを生成
     */
    getProject(): Project | null {
        if (!this.projectConnection) {
            logger.warn("Project connection not established");
            return null;
        }

        const metadata = this.getProjectMetadata();
        if (!metadata) {
            logger.warn("Project metadata not found");
            return null;
        }

        // Projectオブジェクトを作成
        const project = new Project({
            id: metadata.id,
            title: metadata.title,
            created: metadata.createdAt,
            lastChanged: metadata.lastModified,
        });

        // ページ一覧を取得してItemsとして設定
        const pages = this.getPages();
        pages.forEach(pageMetadata => {
            const pageItem = new Item({
                id: pageMetadata.id,
                text: pageMetadata.title,
                author: pageMetadata.author,
                created: pageMetadata.createdAt,
                lastChanged: pageMetadata.lastModified,
            });
            project.items.insertAtEnd(pageItem);
        });

        return project;
    }

    /**
     * 指定されたページ識別子（ID または タイトル）から Item オブジェクトを生成
     */
    async getPageItem(pageIdentifier: string): Promise<Item | null> {
        try {
            // 1) まずはIDとしてメタデータを取得
            let pageMetadata = this.getPageMetadata(pageIdentifier);

            // 2) IDで見つからなければ、タイトル一致で検索
            if (!pageMetadata) {
                const byTitle = this.getPages().find(p => p.title === pageIdentifier);
                if (byTitle) {
                    pageMetadata = byTitle;
                }
            }

            // 3) まだ見つからなければ新規作成（タイトル = 渡された識別子）
            if (!pageMetadata) {
                logger.info(`Page not found by id or title: "${pageIdentifier}", creating new page`);
                const createdPageId = await this.createPage(pageIdentifier, "anonymous", []);
                pageMetadata = this.getPageMetadata(createdPageId);
                if (!pageMetadata) {
                    logger.error(`Failed to create page for identifier: ${pageIdentifier}`);
                    return null;
                }
            }

            // ページのItemオブジェクトを作成
            const pageItem = new Item({
                id: pageMetadata.id,
                text: pageMetadata.title,
                author: pageMetadata.author,
                created: pageMetadata.createdAt,
                lastChanged: pageMetadata.lastModified,
            });

            // ページのコンテンツを取得してitemsに設定（必ず実在するIDで接続）
            const treeManager = await this.connectToPage(pageMetadata.id);
            const rootItems = treeManager.getRootItems();

            rootItems.forEach(yjsItem => {
                const contentItem = new Item({
                    id: yjsItem.id,
                    text: yjsItem.text,
                    author: yjsItem.author,
                    created: yjsItem.created,
                    lastChanged: yjsItem.lastChanged,
                });
                pageItem.items.insertAtEnd(contentItem);
            });

            return pageItem;
        } catch (error) {
            logger.error(`Failed to get page item for ${pageIdentifier}:`, error as any);
            return null;
        }
    }

    /**
     * WebSocket接続が完了するまで待機
     */
    async waitForConnection(timeoutMs: number = 5000): Promise<boolean> {
        if (!this.projectConnection) {
            return false;
        }

        const roomName = this.projectConnection.roomName;
        const startTime = Date.now();

        return new Promise((resolve) => {
            const checkConnection = () => {
                const status = yjsService.getConnectionStatus(roomName);

                if (status === "connected") {
                    logger.info(`WebSocket connection established for project: ${this.projectId}`);
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime > timeoutMs) {
                    logger.warn(`WebSocket connection timeout for project: ${this.projectId}`);
                    resolve(false);
                    return;
                }

                // 100ms後に再チェック
                setTimeout(checkConnection, 100);
            };

            checkConnection();
        });
    }

    /**
     * プロジェクトメタデータを初期化
     */
    private initializeProjectMetadata(initialTitle?: string): void {
        if (!this.projectConnection) {
            logger.warn("Cannot initialize project metadata: no project connection");
            return;
        }

        logger.info(`Initializing project metadata for ${this.projectId} with initialTitle: "${initialTitle}"`);

        const doc = this.projectConnection.doc;
        const metadataMap = doc.getMap("metadata");

        const existingMetadata = metadataMap.get("metadata") as ProjectMetadata;
        logger.info(`Existing metadata: ${existingMetadata ? `title="${existingMetadata.title}"` : "none"}`);

        if (!existingMetadata) {
            // 新規作成の場合
            const defaultTitle = initialTitle || `Project ${this.projectId}`;
            const metadata: ProjectMetadata = {
                id: this.projectId,
                title: defaultTitle,
                createdAt: Date.now(),
                lastModified: Date.now(),
                author: "system",
            };

            metadataMap.set("metadata", metadata);
            logger.info(
                `Project metadata initialized with title: "${defaultTitle}" (initialTitle: "${initialTitle}", projectId: "${this.projectId}")`,
            );
        } else {
            // 既存のメタデータがある場合
            logger.info(
                `Project metadata already exists with title: "${existingMetadata.title}" (initialTitle: "${initialTitle}")`,
            );

            // initialTitleが提供されており、既存のタイトルと異なる場合は更新
            if (initialTitle && initialTitle !== existingMetadata.title) {
                const updatedMetadata: ProjectMetadata = {
                    ...existingMetadata,
                    title: initialTitle,
                    lastModified: Date.now(),
                };
                metadataMap.set("metadata", updatedMetadata);
                logger.info(`Project metadata title updated from "${existingMetadata.title}" to "${initialTitle}"`);
            }
        }
    }

    /**
     * ページ一覧を取得
     */
    getPages(): PageMetadata[] {
        if (!this.projectConnection) return [];

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");

        const pages: PageMetadata[] = [];
        pagesIndex.forEach((pageData) => {
            if (pageData && typeof pageData === "object" && !(pageData as any).deleted) {
                pages.push(pageData as PageMetadata);
            }
        });

        // order順でソート
        return pages.sort((a, b) => a.order - b.order);
    }

    /**
     * プロジェクトをクリーンアップ（テスト用）
     */
    cleanupProject(): void {
        if (!this.projectConnection) return;

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");

        // 全てのページを削除
        pagesIndex.clear();

        // プロジェクトメタデータもクリア
        const metadata = doc.getMap("metadata");
        metadata.clear();

        // ページ接続もクリーンアップ
        this.pageConnections.clear();
        this.pageManagers.clear();

        logger.info("Project cleaned up for testing");
    }

    /**
     * 新しいページを作成
     */
    async createPage(title: string, author: string, lines: string[] = [], pageId?: string): Promise<string> {
        if (!this.projectConnection) {
            throw new Error("Project not connected");
        }

        const finalPageId = pageId || uuid();
        const now = Date.now();

        // ページメタデータを作成
        const pageMetadata: PageMetadata = {
            id: finalPageId,
            title,
            createdAt: now,
            lastModified: now,
            order: this.getNextPageOrder(),
            author,
            deleted: false,
        };

        // Project DocのpagesIndexに追加
        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        pagesIndex.set(finalPageId, pageMetadata);

        // Page Docに接続してアウトライン木を初期化
        const treeManager = await this.connectToPage(finalPageId);

        // ページタイトルノードを作成（DataValidator仕様に合わせる）
        const titleNodeId = treeManager.insertItem(title, author, "root");
        logger.info(`Page title node created: ${titleNodeId} for page "${title}"`);

        // 初期コンテンツをタイトルノード配下に追加
        if (lines.length > 0) {
            for (const line of lines) {
                treeManager.insertItem(line, author, titleNodeId);
            }
        }

        logger.info(`Page created: ${finalPageId} (${title}) with ${lines.length} items`);
        return finalPageId;
    }

    /**
     * 新しいページを指定されたアイテムIDで作成（Fluid統合用）
     */
    async createPageWithItemIds(
        title: string,
        author: string,
        lines: string[] = [],
        pageId?: string,
        itemIds: string[] = [],
    ): Promise<string> {
        if (!this.projectConnection) {
            throw new Error("Project not connected");
        }

        const finalPageId = pageId || uuid();
        const now = Date.now();

        // ページメタデータを作成
        const pageMetadata: PageMetadata = {
            id: finalPageId,
            title,
            createdAt: now,
            lastModified: now,
            order: this.getNextPageOrder(),
            author,
            deleted: false,
        };

        // ページをインデックスに追加
        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        pagesIndex.set(finalPageId, pageMetadata);

        // ページに接続してアイテムを作成
        const treeManager = await this.connectToPage(finalPageId);

        // ページタイトルノードを作成（DataValidator仕様に合わせる）
        const titleNodeId = treeManager.insertItem(title, author, "root");
        logger.info(`Page title node created: ${titleNodeId} for page "${title}"`);

        // 指定されたIDでアイテムをタイトルノード配下に作成
        if (lines.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const itemId = i < itemIds.length ? itemIds[i] : undefined;
                treeManager.insertItem(line, author, titleNodeId, undefined, itemId);
                console.log(
                    `YjsProjectManager: Created item "${line}" with ID: ${itemId || "auto-generated"} under title node`,
                );
            }
        }

        logger.info(`Page created with item IDs: ${finalPageId} (${title}) with ${lines.length} items`);
        console.log(`YjsProjectManager: Used item IDs:`, itemIds);
        return finalPageId;
    }

    /**
     * 既存のページに新しいアイテムを追加
     */
    async addItemToPage(
        pageId: string,
        text: string,
        author: string,
        parentId?: string,
        customItemId?: string,
    ): Promise<string | null> {
        try {
            if (!this.projectConnection) {
                logger.warn("Cannot add item to page: not connected to project");
                return null;
            }

            const doc = this.projectConnection.doc;
            const pagesIndex = doc.getMap("pagesIndex");

            // まず与えられた pageId で検索
            let effectivePageId: string | null = null;
            const direct = pagesIndex.get(pageId) as any;
            if (direct && !(direct as any).deleted) {
                effectivePageId = pageId;
            } else {
                // タイトル一致で解決（テストやプレースホルダーでタイトルが渡るケースに対応）
                const pages: PageMetadata[] = [];
                pagesIndex.forEach((p) => {
                    if (p && typeof p === "object" && !(p as any).deleted) pages.push(p as PageMetadata);
                });
                const byTitle = pages.find(p => p.title === pageId);
                if (byTitle) {
                    effectivePageId = byTitle.id;
                    logger.info(`Resolved pageId by title match: "${pageId}" -> ${effectivePageId}`);
                }
            }

            if (!effectivePageId) {
                logger.warn(`Page not found or deleted: ${pageId}`);
                return null;
            }

            // ページに接続
            const treeManager = await this.connectToPage(effectivePageId);

            // parentIdが指定されていない場合は、タイトルノードを探して配下に配置
            let finalParentId = parentId;
            if (!finalParentId) {
                const pageMetadata = this.getPageMetadata(pageId);
                if (pageMetadata) {
                    const rootItems = treeManager.getRootItems();
                    const titleNode = rootItems.find(item => item.text === pageMetadata.title);
                    if (titleNode) {
                        finalParentId = titleNode.id;
                        logger.info(`Using title node as parent: ${finalParentId} for page "${pageMetadata.title}"`);
                    } else {
                        logger.warn(`Title node not found for page "${pageMetadata.title}", creating at root level`);
                    }
                }
            }

            // アイテムを追加
            const itemId = treeManager.insertItem(text, author, finalParentId, undefined, customItemId);

            logger.info(
                `Item added to page ${pageId}: ${itemId} (text: "${text}") under parent: ${finalParentId || "root"}`,
            );
            return itemId;
        } catch (error) {
            logger.error(`Failed to add item to page ${pageId}:`, error);
            return null;
        }
    }

    /**
     * ページのメタデータを取得
     */
    getPageMetadata(pageId: string): PageMetadata | null {
        if (!this.projectConnection) {
            return null;
        }

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        const pageData = pagesIndex.get(pageId) as PageMetadata;

        return pageData || null;
    }

    /**
     * ページに接続
     */
    async connectToPage(pageId: string): Promise<YjsOrderedTreeManager> {
        try {
            // 既に接続済みの場合は既存のマネージャーを返す
            if (this.pageManagers.has(pageId)) {
                return this.pageManagers.get(pageId)!;
            }

            // Page Docに接続
            const pageConnection = await yjsService.createPageConnection(this.projectId, pageId);
            this.pageConnections.set(pageId, pageConnection);

            // アウトライン木マネージャーを作成
            const treeManager = new YjsOrderedTreeManager(pageConnection.doc, "outline");
            this.pageManagers.set(pageId, treeManager);

            logger.info(`Connected to page: ${pageId}`);
            return treeManager;
        } catch (error) {
            logger.error(`Failed to connect to page ${pageId}:`, error as any);
            throw error;
        }
    }

    /**
     * ページを削除（論理削除）
     */
    deletePage(pageId: string): void {
        if (!this.projectConnection) return;

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        const pageData = pagesIndex.get(pageId) as PageMetadata;

        if (pageData) {
            const updatedData: PageMetadata = {
                ...pageData,
                deleted: true,
                lastModified: Date.now(),
            };
            pagesIndex.set(pageId, updatedData);

            logger.info(`Page deleted: ${pageId}`);
        }
    }

    /**
     * ページタイトルを更新
     */
    updatePageTitle(pageId: string, newTitle: string): void {
        if (!this.projectConnection) {
            return;
        }

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        const pageData = pagesIndex.get(pageId) as PageMetadata;

        if (pageData) {
            const updatedData: PageMetadata = {
                ...pageData,
                title: newTitle,
                lastModified: Date.now(),
            };
            pagesIndex.set(pageId, updatedData);

            logger.info(`Page title updated: ${pageId} -> ${newTitle}`);
        } else {
            // ページデータが存在しない場合は警告を出すが、新規作成はしない
            logger.warn(`Cannot update page title: page not found ${pageId}`);
        }
    }

    /**
     * ページの順序を更新
     */
    updatePageOrder(pageId: string, newOrder: number): void {
        if (!this.projectConnection) return;

        const doc = this.projectConnection.doc;
        const pagesIndex = doc.getMap("pagesIndex");
        const pageData = pagesIndex.get(pageId) as PageMetadata;

        if (pageData) {
            const updatedData: PageMetadata = {
                ...pageData,
                order: newOrder,
                lastModified: Date.now(),
            };
            pagesIndex.set(pageId, updatedData);

            logger.info(`Page order updated: ${pageId} -> ${newOrder}`);
        }
    }

    /**
     * 次のページ順序番号を取得
     */
    private getNextPageOrder(): number {
        const pages = this.getPages();
        if (pages.length === 0) return 0;

        const maxOrder = Math.max(...pages.map(p => p.order));
        return maxOrder + 1;
    }

    /**
     * プロジェクトメタデータを取得
     */
    getProjectMetadata(): ProjectMetadata | null {
        if (!this.projectConnection) {
            logger.debug("getProjectMetadata(): no project connection");
            return null;
        }

        const doc = this.projectConnection.doc;
        const metadataMap = doc.getMap("metadata");
        const metadata = metadataMap.get("metadata") as ProjectMetadata || null;
        logger.debug(
            `getProjectMetadata(): ${metadata ? `found metadata with title "${metadata.title}"` : "no metadata found"}`,
        );
        return metadata;
    }

    /**
     * プロジェクトタイトルを更新
     */
    updateProjectTitle(newTitle: string): boolean {
        if (!this.projectConnection) {
            logger.warn("Cannot update project title: not connected");
            return false;
        }

        logger.info(`Updating project title for ${this.projectId} to: "${newTitle}"`);

        const doc = this.projectConnection.doc;
        const metadataMap = doc.getMap("metadata");
        const currentMetadata = metadataMap.get("metadata") as ProjectMetadata;

        logger.info(`Current metadata: ${currentMetadata ? `title="${currentMetadata.title}"` : "none"}`);

        if (currentMetadata) {
            const updatedMetadata: ProjectMetadata = {
                ...currentMetadata,
                title: newTitle,
                lastModified: Date.now(),
            };
            metadataMap.set("metadata", updatedMetadata);

            logger.info(`Project title updated from "${currentMetadata.title}" to "${newTitle}"`);

            // 更新後の確認
            const verifyMetadata = metadataMap.get("metadata") as ProjectMetadata;
            logger.info(`Verification: updated metadata title is "${verifyMetadata?.title}"`);

            return true;
        } else {
            logger.warn("Cannot update project title: metadata not found");

            // メタデータが存在しない場合は新規作成
            const newMetadata: ProjectMetadata = {
                id: this.projectId,
                title: newTitle,
                createdAt: Date.now(),
                lastModified: Date.now(),
                author: "system",
            };
            metadataMap.set("metadata", newMetadata);
            logger.info(`Created new metadata with title: "${newTitle}"`);

            return true;
        }
    }

    /**
     * プロジェクトタイトルを取得
     */
    getProjectTitle(): string | null {
        if (!this.projectConnection) {
            logger.warn("getProjectTitle(): no project connection");
            return null;
        }

        const metadata = this.getProjectMetadata();
        const title = metadata ? metadata.title : null;
        logger.info(`getProjectTitle() for ${this.projectId}: "${title}" (metadata exists: ${!!metadata})`);

        // デバッグ: Y.Docの状態も確認
        const doc = this.projectConnection.doc;
        const metadataMap = doc.getMap("metadata");
        const rawMetadata = metadataMap.get("metadata");
        logger.info(`getProjectTitle() raw metadata: ${rawMetadata ? JSON.stringify(rawMetadata) : "null"}`);

        return title;
    }

    /**
     * ページマネージャーを取得
     */
    getPageManager(pageId: string): YjsOrderedTreeManager | null {
        return this.pageManagers.get(pageId) || null;
    }

    /**
     * 接続を閉じる
     */
    disconnect(): void {
        // ページ接続を閉じる
        this.pageConnections.forEach((connection) => {
            yjsService.closeConnection(connection.roomName);
        });
        this.pageConnections.clear();
        this.pageManagers.clear();

        // プロジェクト接続を閉じる
        if (this.projectConnection) {
            yjsService.closeConnection(this.projectConnection.roomName);
            this.projectConnection = null;
        }

        logger.info(`Disconnected from project: ${this.projectId}`);
    }

    /**
     * プロジェクト接続を取得
     */
    getProjectConnection(): YjsConnection | null {
        return this.projectConnection;
    }

    /**
     * ページ接続を取得
     */
    getPageConnection(pageId: string): YjsConnection | null {
        return this.pageConnections.get(pageId) || null;
    }
}
