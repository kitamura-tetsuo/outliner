// @ts-nocheck
import { Items, Project } from "@common/schema/app-schema";
import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { type IFluidContainer } from "@fluidframework/fluid-static";
import { getPresence } from "@fluidframework/presence/beta";
import { TinyliciousClient, type TinyliciousContainerServices } from "@fluidframework/tinylicious-client";
import { ConnectionState, type TreeView } from "fluid-framework";
import { userManager } from "../auth/UserManager";
import { getLogger } from "../lib/logger";
import { editorOverlayStore } from "../stores/EditorOverlayStore.svelte";
import { colorForUser, presenceStore } from "../stores/PresenceStore.svelte";
import { getWorkspace } from "./presenceSchema";

const logger = getLogger();

/**
 * FluidClientの初期化パラメータ
 */
interface FluidClientParams {
    clientId: string;
    client: AzureClient | TinyliciousClient;
    container: IFluidContainer;
    containerId: string;
    appData: TreeView<typeof Project>;
    project: Project;
    services: any;
}

export class FluidClient {
    public readonly clientId: string;

    // Public properties - コンストラクタで初期化
    public readonly client: AzureClient | TinyliciousClient;
    public readonly container: IFluidContainer;
    public readonly containerId: string;
    public readonly appData: TreeView<typeof Project>;
    public readonly services: AzureContainerServices | TinyliciousContainerServices;
    public readonly project: Project;

    // 接続ステータスの追跡
    private connectionListenerCleanup: (() => void) | null = null;
    private connectionRetryCount = 0;
    private readonly MAX_RETRY_COUNT = 3;
    currentUser: { id: string; } | null = null;

    /**
     * コンストラクタ - 必要なパラメータを全て受け取る
     */
    constructor(params: FluidClientParams) {
        this.clientId = params.clientId;
        this.client = params.client;
        this.container = params.container;
        this.containerId = params.containerId;
        this.appData = params.appData;
        this.project = params.project;
        this.services = params.services;

        logger.debug("Created new FluidClient instance with ID: " + this.clientId);

        // 接続状態監視を設定
        this.setupConnectionMonitoring();
        this._setupDebugEventListeners();
        this.setupPresence();
    }

    // 接続状態の監視を設定
    private setupConnectionMonitoring() {
        if (!this.container) return;

        // 以前のリスナーがあれば解除
        if (this.connectionListenerCleanup) {
            this.connectionListenerCleanup();
        }

        // 接続状態の監視を設定
        this.connectionListenerCleanup = this.setupConnectionListeners(
            this.container,
            // 接続時のコールバック
            () => {
                logger.info("Connected to Fluid service");
                this.connectionRetryCount = 0; // 接続成功したらリトライカウントをリセット

                // カスタムイベントを発行して接続成功を通知
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("fluidConnected", {
                            detail: { containerId: this.containerId },
                        }),
                    );
                }
            },
            // 切断時のコールバック
            () => {
                logger.info("Disconnected from Fluid service");

                // 切断イベントを発行
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("fluidDisconnected"));
                }

                // リトライ回数が上限に達していなければ再接続を試みる
                if (this.connectionRetryCount < this.MAX_RETRY_COUNT) {
                    this.connectionRetryCount++;
                    logger.info(`再接続を試みます (${this.connectionRetryCount}/${this.MAX_RETRY_COUNT})...`);

                    // 少し待ってから再接続
                    setTimeout(() => {
                        this.reconnect();
                    }, 2000);
                } else {
                    logger.warn("最大再接続回数に達しました。手動での再接続が必要です。");
                }
            },
        );
    }

    /**
     * Fluidコンテナの接続状態を監視する
     * @param container Fluidコンテナ
     * @param onConnected 接続時のコールバック
     * @param onDisconnected 切断時のコールバック
     * @returns イベントリスナー解除用の関数
     */
    private setupConnectionListeners(
        container: any,
        onConnected?: () => void,
        onDisconnected?: () => void,
    ): () => void {
        if (!container) {
            return () => {};
        }

        const connectedListener = () => {
            if (onConnected) onConnected();
        };

        const disconnectedListener = () => {
            if (onDisconnected) onDisconnected();
        };

        container.on("connected", connectedListener);
        container.on("disconnected", disconnectedListener);

        return () => {
            container.off("connected", connectedListener);
            container.off("disconnected", disconnectedListener);
        };
    }

    public getProject() {
        return this.project;
    }

    public getTree() {
        const rootItems = this.project?.items as Items;
        return rootItems;
    }

    /**
     * コンテナが接続済みかどうかを確認します
     */
    public get isContainerConnected(): boolean {
        if (!this.container) return false;
        return this.container.connectionState !== ConnectionState.Disconnected;
    }

    /**
     * コンテナの接続状態を取得します
     */
    public get connectionState(): ConnectionState | undefined {
        return this.container?.connectionState;
    }

    /**
     * コンテナの接続状態を文字列で取得します
     */
    public getConnectionStateString(): string {
        if (!this.container) return "コンテナ未接続";

        switch (this.container.connectionState) {
            case ConnectionState.Connected:
                return "接続済み";
            case ConnectionState.Disconnected:
                return "切断";
            case ConnectionState.EstablishingConnection:
                return "接続中";
            case ConnectionState.CatchingUp:
                return "同期中";
            default:
                return "不明";
        }
    }

    // デバッグ用のイベントリスナー設定
    private _setupDebugEventListeners() {
        if (!this.container) return;

        // TypeScriptの型定義ではopイベントは認識されていないが、実際のランタイムでは機能する
        // @ts-ignore - カスタムイベントタイプはTypeScriptの型定義に含まれていない
        this.container.on("op", (op: any) => {
            logger.debug("Operation received:", op);
        });
    }

    private setupPresence() {
        const presence = getPresence(this.container);
        const workspace = getWorkspace(presence);

        workspace.position.events.on("remoteUpdated", (update) => {
            const pos = update.value();
            if (pos) {
                const user = presenceStore.users[update.attendee.attendeeId];
                if (user) {
                    // Ensure remote cursors use a stable entry via setCursor
                    editorOverlayStore.setCursor({
                        itemId: pos.itemId,
                        offset: pos.offset,
                        isActive: true,
                        userId: user.userId,
                        userName: user.userName,
                        color: user.color,
                    });
                }
            }
        });

        // Publish local cursor updates to presence via a lightweight hook
        editorOverlayStore.setPresencePublisher((cursor) => {
            workspace.position.local = cursor;
        });

        const audience = (this.services as any)?.audience;
        if (!audience) return;

        const updateMembers = () => {
            const members = audience.getMembers();
            const active = new Set<string>();
            members.forEach((m: any, id: string) => {
                const name = m.name ?? id;
                const color = colorForUser(id);
                presenceStore.setUser({ userId: id, userName: name, color });
                active.add(id);
            });
            presenceStore.getUsers().forEach(u => {
                if (!active.has(u.userId)) {
                    presenceStore.removeUser(u.userId);
                    editorOverlayStore.clearCursorAndSelection(u.userId);
                }
            });
        };

        audience.on("membersChanged", updateMembers);
        updateMembers();
    }

    // デバッグ用のヘルパーメソッド
    getDebugInfo() {
        // rootItems の安全な取得
        const rootItems = this.appData?.root?.items as Items;
        const hasItems = rootItems && rootItems.length > 0;

        return {
            clientInitialized: !!this.client,
            containerConnected: this.isContainerConnected,
            connectionState: this.getConnectionStateString(),
            containerId: this.containerId,
            treeData: this.appData?.root ? this.getAllData() : {},
            treeCount: rootItems?.length || 0,
            treeFirstItem: hasItems ? rootItems[0]?.text || null : null,
            timeStamp: new Date().toISOString(),
            currentUser: userManager.getCurrentUser(),
        };
    }

    // 以下は共有データ操作用のヘルパーメソッド
    getAllData() {
        if (this.appData?.root) {
            const rootItems = this.appData.root.items as Items;
            return {
                itemCount: rootItems.length,
                items: [...rootItems].map(item => this._processItemRecursively(item)),
            };
        }
        return {};
    }

    /**
     * SharedTreeの内容をJSON形式で取得する
     * テストでの検証に使用できる形式で返す
     * @param path 特定のパスのデータのみを取得する場合に指定（例: "items.0.text"）
     * @returns JSON形式のデータ
     */
    getTreeAsJson(path?: string) {
        const treeData = this.getAllData();
        if (!path) return treeData;

        // パスに基づいてデータを取得
        const parts = path.split(".");
        let result = treeData as any;
        for (const part of parts) {
            if (result === undefined || result === null) return null;
            result = result[part];
        }
        return result;
    }

    /**
     * アイテムとその子アイテムを再帰的に処理するヘルパーメソッド
     * @param item 処理するアイテム
     * @returns 処理されたアイテムとその子アイテムを含むオブジェクト
     */
    private _processItemRecursively(item: any) {
        interface ItemData {
            id: string;
            text: string;
            author: string;
            votes: string[];
            created: number;
            lastChanged: number;
            items?: ItemData[];
        }

        const result: ItemData = {
            id: item.id,
            text: item.text,
            author: item.author,
            votes: [...item.votes],
            created: item.created,
            lastChanged: item.lastChanged,
        };

        if (item.items && item.items.length > 0) {
            result.items = [...item.items].map(childItem => this._processItemRecursively(childItem));
        }

        return result;
    }

    // コンポーネント破棄時のクリーンアップ
    public dispose() {
        if (this.connectionListenerCleanup) {
            this.connectionListenerCleanup();
            this.connectionListenerCleanup = null;
        }

        const me = (this.services as any)?.audience?.getMyself?.();
        const id = me?.user?.id ?? this.clientId;
        presenceStore.removeUser(id);

        this.appData.dispose();
        this.container.dispose();
    }

    // 再接続を試みる
    private async reconnect() {
        try {
            logger.info("Attempting to reconnect...");

            // 現在のコンテナIDがある場合は、そのIDに特化したトークンを更新
            if (this.containerId) {
                logger.info(`Refreshing token for container: ${this.containerId}`);
                await userManager.refreshToken(this.containerId);

                // 更新したトークンで再接続
                if (this.container) {
                    logger.info("Reconnecting with refreshed token...");
                    this.container.connect();
                }
            } else {
                // 一般的なトークン更新

                await userManager.refreshToken();

                if (this.container) {
                    this.container.connect();
                }
            }
        } catch (error) {
            logger.error("Reconnection failed:", error);
        }
    }

    public async createPage(pageName: string, lines: string[]): Promise<void> {
        try {
            // ページを作成
            const pageItem = this.project.addPage(pageName, "test-user");
            const pageItems = pageItem.items as Items;
            for (const line of lines) {
                const item = pageItems.addNode("test-user");
                item.updateText(line);
            }
        } catch (error) {
            console.error("Error creating page:", error);
            throw error;
        }
    }
}
