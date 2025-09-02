// Yjs接続管理サービス
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import { Doc as YDoc } from "yjs";
import { userManager } from "../auth/UserManager";
import { getLogger } from "./logger";
import { YjsPresenceManager } from "./yjsPresence.svelte";

const logger = getLogger();

export interface YjsConnectionConfig {
    websocketUrl: string;
    roomName: string;
    docGuid?: string;
}

export interface YjsConnection {
    doc: YDoc;
    websocketProvider: WebsocketProvider;
    indexeddbProvider?: IndexeddbPersistence | null;
    presenceManager: YjsPresenceManager;
    roomName: string;
}

/**
 * Yjs接続管理クラス
 */
export class YjsService {
    private connections = new Map<string, YjsConnection>();
    private websocketUrl: string;

    constructor() {
        // 環境に応じてWebSocketURLを設定
        const isProduction = import.meta.env.PROD;

        if (isProduction) {
            // 本番環境: HTTPS/WSSを使用
            this.websocketUrl = "wss://yjs.example.com"; // 実際のURLに置き換え
        } else {
            // 開発環境: ローカルサーバーを使用
            this.websocketUrl = "ws://localhost:1234";
        }

        // Yjsライブラリをグローバルに設定（テスト用）
        if (typeof window !== "undefined") {
            (window as any).Y = { Doc: YDoc };
        }

        logger.info(`YjsService initialized with WebSocket URL: ${this.websocketUrl}`);
    }

    /**
     * WebSocketURLを設定
     */
    setWebsocketUrl(url: string): void {
        this.websocketUrl = url;
        logger.info(`WebSocket URL updated: ${url}`);
    }

    /**
     * 現在のWebSocketURLを取得
     */
    getWebsocketUrl(): string {
        return this.websocketUrl;
    }

    /**
     * プロジェクト接続を作成
     */
    async createProjectConnection(projectId: string): Promise<YjsConnection> {
        const roomName = `project:${projectId}`;

        if (this.connections.has(roomName)) {
            return this.connections.get(roomName)!;
        }

        logger.info(`Creating project connection for: ${roomName}`);

        // Y.Docを作成
        const doc = new YDoc({ guid: projectId });

        // IndexedDB永続化を設定（Node/Vitest環境ではindexedDBがないためスキップ）
        const hasIndexedDB = typeof (globalThis as any).indexedDB !== "undefined";
        const indexeddbProvider = hasIndexedDB ? new IndexeddbPersistence(roomName, doc) : null;
        if (!hasIndexedDB) {
            logger.info("IndexedDB not available; skipping y-indexeddb persistence");
        }

        // Firebase IDトークン取得戦略
        const isTestEnv = import.meta.env.MODE === "test"
            || process.env.NODE_ENV === "test"
            || import.meta.env.VITE_IS_TEST === "true";
        const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

        // 認証が必要な場合は待機（特にエミュレータ使用時）
        if (useEmulator) {
            const start = Date.now();
            const timeoutMs = 8000;
            while (!(userManager as any).auth?.currentUser && Date.now() - start < timeoutMs) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        const user = userManager.getCurrentUser();
        if (!user) {
            throw new Error("User not authenticated (no current user)");
        }

        // Firebase UserオブジェクトからIDトークンを取得
        let idToken: string;
        if (isTestEnv && !useEmulator) {
            // テスト環境かつエミュレータ未使用時のみバイパス（サーバ側も検証スキップ）
            idToken = "test-id-token";
            logger.info("Using bypass test ID token for Yjs connection (no emulator)");
        } else {
            const firebaseUser = (userManager as any).auth?.currentUser;
            if (!firebaseUser) {
                throw new Error("Firebase user not available for token retrieval");
            }
            idToken = await firebaseUser.getIdToken(true);
        }

        // WebSocketプロバイダーを設定
        const websocketProvider = new WebsocketProvider(
            this.websocketUrl,
            roomName,
            doc,
            {
                params: { auth: idToken },
            },
        );

        // プレゼンス管理を設定
        const presenceManager = new YjsPresenceManager(
            doc,
            user.id,
            user.name,
        );

        // トークン更新の監視（テスト環境では無効化）
        if (!isTestEnv) {
            const firebaseUser = userManager.auth.currentUser;
            if (firebaseUser) {
                this.setupTokenRefresh(websocketProvider, firebaseUser);
            }
        }

        const connection: YjsConnection = {
            doc,
            websocketProvider,
            indexeddbProvider,
            presenceManager,
            roomName,
        };

        this.connections.set(roomName, connection);
        logger.info(`Project connection created: ${roomName}`);

        return connection;
    }

    /**
     * ページ接続を作成
     */
    async createPageConnection(projectId: string, pageId: string): Promise<YjsConnection> {
        const roomName = `page:${projectId}:${pageId}`;

        if (this.connections.has(roomName)) {
            return this.connections.get(roomName)!;
        }

        logger.info(`Creating page connection for: ${roomName}`);

        // Y.Docを作成
        const doc = new YDoc({ guid: pageId });

        // IndexedDB永続化を設定（Node/Vitest環境ではindexedDBがないためスキップ）
        const hasIndexedDB = typeof (globalThis as any).indexedDB !== "undefined";
        const indexeddbProvider = hasIndexedDB ? new IndexeddbPersistence(roomName, doc) : null;
        if (!hasIndexedDB) {
            logger.info("IndexedDB not available; skipping y-indexeddb persistence (page)");
        }

        // Firebase IDトークン取得戦略（ページ接続）
        const isTestEnv = import.meta.env.MODE === "test"
            || process.env.NODE_ENV === "test"
            || import.meta.env.VITE_IS_TEST === "true";
        const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

        // 認証が必要な場合は待機（特にエミュレータ使用時）
        if (useEmulator) {
            const start = Date.now();
            const timeoutMs = 8000;
            while (
                (userManager as any).auth && !(userManager as any).auth.currentUser && Date.now() - start < timeoutMs
            ) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        const user = userManager.getCurrentUser();
        if (!user) {
            throw new Error("User not authenticated (no current user)");
        }

        // Firebase UserオブジェクトからIDトークンを取得
        let idToken: string;
        if (isTestEnv && !useEmulator) {
            // テスト環境かつエミュレータ未使用時のみバイパス
            idToken = "test-id-token";
            logger.info("Using bypass test ID token for Yjs page connection (no emulator)");
        } else {
            const firebaseUser = (userManager as any).auth?.currentUser;
            if (!firebaseUser) {
                throw new Error("Firebase user not available for token retrieval (page)");
            }
            idToken = await firebaseUser.getIdToken(true);
        }

        // WebSocketプロバイダーを設定
        const websocketProvider = new WebsocketProvider(
            this.websocketUrl,
            roomName,
            doc,
            {
                params: { auth: idToken },
            },
        );

        // プレゼンス管理を設定
        const presenceManager = new YjsPresenceManager(
            doc,
            user.id,
            user.name,
        );

        // トークン更新の監視（テスト環境では無効化）
        if (!isTestEnv) {
            const firebaseUser = userManager.auth.currentUser;
            if (firebaseUser) {
                this.setupTokenRefresh(websocketProvider, firebaseUser);
            }
        }

        const connection: YjsConnection = {
            doc,
            websocketProvider,
            indexeddbProvider,
            presenceManager,
            roomName,
        };

        this.connections.set(roomName, connection);
        logger.info(`Page connection created: ${roomName}`);

        return connection;
    }

    /**
     * 接続を取得
     */
    getConnection(roomName: string): YjsConnection | undefined {
        return this.connections.get(roomName);
    }

    /**
     * 接続を閉じる
     */
    closeConnection(roomName: string): void {
        const connection = this.connections.get(roomName);
        if (connection) {
            logger.info(`Closing connection: ${roomName}`);

            connection.presenceManager.destroy();
            connection.websocketProvider.destroy();
            connection.indexeddbProvider?.destroy?.();
            connection.doc.destroy();

            this.connections.delete(roomName);
        }
    }

    /**
     * 全ての接続を閉じる
     */
    closeAllConnections(): void {
        logger.info("Closing all connections");

        for (const roomName of this.connections.keys()) {
            this.closeConnection(roomName);
        }
    }

    /**
     * トークン更新の設定
     */
    private setupTokenRefresh(provider: WebsocketProvider, firebaseUser: any): void {
        // 定期的にトークンを更新（50分ごと）
        const refreshInterval = setInterval(async () => {
            try {
                const newToken = await firebaseUser.getIdToken(true); // 強制更新
                if (provider.ws && provider.ws.readyState === WebSocket.OPEN) {
                    // 新しいトークンでパラメータを更新
                    provider.params = { ...provider.params, auth: newToken };
                    logger.info("Firebase ID token refreshed");
                }
            } catch (error) {
                logger.error("Failed to refresh Firebase ID token:", error as any);
            }
        }, 50 * 60 * 1000); // 50分

        // WebSocketが閉じられたときにインターバルをクリア
        provider.ws?.addEventListener("close", () => {
            clearInterval(refreshInterval);
        });
    }

    // setWebsocketUrl関数は上部で定義済み

    /**
     * 接続状態を取得
     */
    getConnectionStatus(roomName: string): "disconnected" | "connecting" | "connected" {
        const connection = this.connections.get(roomName);
        if (!connection) return "disconnected";

        const wsState = connection.websocketProvider.ws?.readyState;
        switch (wsState) {
            case WebSocket.CONNECTING:
                return "connecting";
            case WebSocket.OPEN:
                return "connected";
            default:
                return "disconnected";
        }
    }

    /**
     * 全ての接続状態を取得
     */
    getAllConnectionStatuses(): Record<string, "disconnected" | "connecting" | "connected"> {
        const statuses: Record<string, "disconnected" | "connecting" | "connected"> = {};

        for (const roomName of this.connections.keys()) {
            statuses[roomName] = this.getConnectionStatus(roomName);
        }

        return statuses;
    }

    /**
     * 接続の再試行
     */
    async reconnectRoom(roomName: string): Promise<void> {
        logger.info(`Reconnecting to room: ${roomName}`);

        const connection = this.connections.get(roomName);
        if (connection) {
            // 既存の接続を閉じる
            connection.websocketProvider.destroy();

            // 新しいトークンで再接続
            const user = userManager.getCurrentUser();
            const firebaseUser = userManager.auth.currentUser;
            if (user && firebaseUser) {
                const idToken = await firebaseUser.getIdToken(true); // 強制更新

                const newProvider = new WebsocketProvider(
                    this.websocketUrl,
                    roomName,
                    connection.doc,
                    {
                        params: { auth: idToken },
                    },
                );

                connection.websocketProvider = newProvider;
                this.setupTokenRefresh(newProvider, firebaseUser);

                logger.info(`Reconnected to room: ${roomName}`);
            }
        }
    }

    /**
     * 全ての接続を再試行
     */
    async reconnectAll(): Promise<void> {
        logger.info("Reconnecting all rooms");

        const roomNames = Array.from(this.connections.keys());
        await Promise.all(roomNames.map(roomName => this.reconnectRoom(roomName)));
    }
}

// シングルトンインスタンス
export const yjsService = new YjsService();

// テスト環境でグローバルに設定
if (typeof window !== "undefined") {
    (window as any).yjsService = yjsService;
}
