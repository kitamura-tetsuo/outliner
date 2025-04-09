import { AzureClient } from "@fluidframework/azure-client";
import {
    type ContainerSchema,
    type IFluidContainer,
} from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import {
    ConnectionState,
    SharedTree,
    type TreeView,
} from "fluid-framework";
import { UserManager } from "../auth/UserManager";
import {
    getConnectionStateString as getConnectionStateStringUtil,
    isContainerConnected as isContainerConnectedUtil,
    setupConnectionListeners,
} from "../lib/fluidService";
import { getLogger } from "../lib/logger";
import {
    Items,
    Project,
} from "../schema/app-schema";
const logger = getLogger();

// IdCompressorを有効にしたコンテナスキーマを定義
export const containerSchema = {
    initialObjects: {
        appData: SharedTree,
    },
} as any satisfies ContainerSchema;

/**
 * FluidClientの初期化パラメータ
 */
export interface FluidClientParams {
    clientId: string;
    client: AzureClient | TinyliciousClient;
    container: IFluidContainer;
    containerId: string;
    appData: TreeView<typeof Project>;
    project: Project;
    services: any;
}

export class FluidClient {
    // 初期化状態フラグ - ファクトリーパターンのため常にtrue
    public readonly isInitialized = true;
    public readonly clientId: string;

    // Public properties - コンストラクタで初期化
    public readonly client: AzureClient | TinyliciousClient;
    public readonly container: IFluidContainer;
    public readonly containerId: string;
    public readonly appData: TreeView<typeof Project>;
    public readonly services: any;
    private readonly project: Project;

    // 接続ステータスの追跡
    private connectionListenerCleanup: (() => void) | null = null;
    private connectionRetryCount = 0;
    private readonly MAX_RETRY_COUNT = 3;
    currentUser: { id: string; } | null = null;

    /**
     * コンストラクタ - 必要なパラメータを全て受け取る
     * 直接呼び出しではなく、createFluidClientファクトリー関数を使用してください
     */
    constructor(params: FluidClientParams) { // すべての必須パラメータをセット
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
    }

    /**
     * 新しいFluidClientインスタンスを作成するファクトリーメソッド
     * @param containerId 既存のコンテナID（省略すると新しいコンテナが作成される）
     * @returns 初期化されたFluidClientインスタンス
     */
    public static async create(containerId?: string): Promise<FluidClient> {
        // fluidService.tsのファクトリー関数を使用
        return import("../lib/fluidService").then(module => module.createFluidClient(containerId));
    } /**
     * ファクトリーパターンを採用したので、このメソッドは不要になりました
     * 新しいFluidClientを作成するには FluidClient.create() を使用してください
     * @deprecated 互換性のために残しています
     */

    public async resolveContainerId(): Promise<string | undefined> {
        // このメソッドは今後使用しないでください
        logger.warn("resolveContainerId() is deprecated. Use FluidClient.create() instead");
        return this.containerId;
    } /**
     * 初期化済みのインスタンスなので、リファレンスをそのまま返します
     * 新しいインスタンスを作成するにはFluidClient.create()を使用してください
     * @deprecated 互換性のために残しています
     */

    public async initialize(): Promise<FluidClient> {
        // すでに完全に初期化されているため、そのまま自身を返す
        return this;
    }

    // 接続状態の監視を設定
    private setupConnectionMonitoring() {
        if (!this.container) return;

        // 以前のリスナーがあれば解除
        if (this.connectionListenerCleanup) {
            this.connectionListenerCleanup();
        }

        // 接続状態の監視を設定
        this.connectionListenerCleanup = setupConnectionListeners(
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
                    // logger.info(`再接続を試みます (${this.connectionRetryCount}/${this.MAX_RETRY_COUNT})...`);

                    // // 少し待ってから再接続
                    // setTimeout(() => {
                    //   this.reconnect();
                    // }, 2000);
                }
                else {
                    logger.warn("最大再接続回数に達しました。手動での再接続が必要です。");
                }
            },
        );
    }

    // 再接続を試みる
    private async reconnect() {
        try {
            logger.info("Attempting to reconnect...");

            // 現在のコンテナIDがある場合は、そのIDに特化したトークンを更新
            if (this.containerId) {
                logger.info(`Refreshing token for container: ${this.containerId}`);
                await UserManager.getInstance().refreshToken(this.containerId);

                // 更新したトークンで再接続
                if (this.container) {
                    logger.info("Reconnecting with refreshed token...");
                    this.container.connect();
                }
            }
            else {
                // 一般的なトークン更新
                const userManager = UserManager.getInstance();
                await userManager.refreshToken();

                if (this.container) {
                    this.container.connect();
                }
            }
        }
        catch (error) {
            logger.error("Reconnection failed:", error);
        }
    }

    public getProject() {
        return this.project;
    }

    public getTree() {
        const rootItems = this.project?.items as Items;
        return rootItems;
    } /**
     * コンテナが接続済みかどうかを確認します
     */

    public get isContainerConnected(): boolean {
        return isContainerConnectedUtil(this.container);
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
        return getConnectionStateStringUtil(this.container);
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
            currentUser: UserManager.getInstance().getCurrentUser(),
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
     * アイテムとその子アイテムを再帰的に処理するヘルパーメソッド
     * @param item 処理するアイテム
     * @returns 処理されたアイテムとその子アイテムを含むオブジェクト
     */
    private _processItemRecursively(item: any) {
        // 型定義を追加して'items'プロパティを許可する
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

        // 子アイテムが存在する場合は再帰的に処理
        if (item.items && item.items.length > 0) {
            result.items = [...item.items].map(childItem => this._processItemRecursively(childItem));
        }

        return result;
    } /**
     * E2Eテスト用に現在のSharedTreeデータ構造を取得する
     * @returns ツリー構造のシリアライズされたデータ
     */

    public getTreeDebugData(): any {
        if (!this.container || !this.appData) {
            return null;
        }

        // SharedTreeのデータ構造をシリアライズして返す
        const treeData = this.appData.root;

        // 再帰的にツリー構造をプレーンなオブジェクトに変換
        return import("../lib/fluidService").then(module => module.serializeTreeNode(treeData));
    } // _serializeTreeNode メソッドは fluidService.serializeTreeNode を直接使用するため削除

    // コンポーネント破棄時のクリーンアップ
    public dispose() {
        if (this.connectionListenerCleanup) {
            this.connectionListenerCleanup();
            this.connectionListenerCleanup = null;
        }

        try {
            // コンテナの切断
            if (this.isContainerConnected) {
                this.container.disconnect();
            }
        }
        catch (e) {
            logger.warn("FluidClient disposal error:", e);
        }
    }
}
