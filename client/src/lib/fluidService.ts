import {
    AzureClient,
    type AzureContainerServices,
    type AzureRemoteConnectionConfig,
    type ITokenProvider,
} from "@fluidframework/azure-client";
import {
    type ContainerSchema,
    type IFluidContainer,
} from "@fluidframework/fluid-static";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    TinyliciousClient,
    type TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";
import {
    SharedTree,
    type TreeView,
    type ViewableTree,
} from "fluid-framework";
import { v4 as uuid } from "uuid";
import { UserManager } from "../auth/UserManager";
import { FluidClient } from "../fluid/fluidClient";
import {
    appTreeConfiguration,
    Items,
    Project,
} from "../schema/app-schema";
import {
    getDefaultContainerId,
    saveFirestoreContainerIdToServer,
} from "../services";
import { fluidStore } from "../stores/fluidStore.svelte";
import { CustomKeyMap } from "./CustomKeyMap";
import {
    getLogger,
    log,
} from "./logger";

const logger = getLogger();

// クライアントキーの型定義
interface FluidClientKey {
    type: "container" | "user";
    id: string;
}

type FluidInstances = [
    TinyliciousClient | AzureClient,
    IFluidContainer | undefined,
    AzureContainerServices | TinyliciousContainerServices | undefined,
    TreeView<typeof Project> | undefined,
    Project | undefined,
];

// シングルトンからマップ型に変更して複数クライアントを管理
const clientRegistry = new CustomKeyMap<FluidClientKey, FluidInstances>();

// Azure Fluid Relayエンドポイント設定
const azureConfig = {
    tenantId: import.meta.env.VITE_AZURE_TENANT_ID || "00000000-0000-0000-0000-000000000000",
    endpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || "https://us.fluidrelay.azure.com",
};

// 開発環境ではTinyliciousを使用する - 環境変数で強制的に切り替え可能
const isTestEnvironment = import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
const useTinylicious = isTestEnvironment || // テスト環境では常にTinyliciousを使用
    import.meta.env.VITE_USE_TINYLICIOUS === "true" ||
    (import.meta.env.DEV && import.meta.env.VITE_FORCE_AZURE !== "true");

// Fluid Frameworkがパスの不一致によるエラーを回避するため、
// ContainerSchemaを直接インポートせずにオブジェクトとして定義
const containerSchema: ContainerSchema = {
    initialObjects: {
        appData: SharedTree,
    },
} as any satisfies ContainerSchema;

// キー生成ロジックを一元化する関数
function createClientKey(userId?: string, containerId?: string): FluidClientKey {
    if (containerId) {
        return { type: "container", id: containerId };
    }
    return { type: "user", id: userId || "anonymous" };
}

// TokenProviderの取得
async function getTokenProvider(userId?: string, containerId?: string): Promise<ITokenProvider> {
    if (!useTinylicious) {
        // Azureモードの場合はUserManagerからトークンを取得
        const userManager = UserManager.getInstance();

        // 特定のコンテナID用のトークンが必要な場合
        if (containerId !== undefined) {
            log("fluidService", "debug", `Requesting token for specific container: ${containerId}`);
            // コンテナID付きで強制的にトークンを更新
            await userManager.refreshToken(containerId);
        }

        // トークンが利用可能になるまで待機
        const fluidToken = await userManager.getCurrentFluidToken();

        if (fluidToken) {
            // サーバーから受け取ったテナントIDを確認
            const tokenTenantId = (fluidToken as any).tenantId;

            // テナントIDをログに出力（デバッグ用）
            log("fluidService", "debug", `Server provided tenantId: ${tokenTenantId || "not provided"}`);
            log("fluidService", "debug", `Local configured tenantId: ${azureConfig.tenantId}`);

            // サーバーから受け取ったテナントIDがある場合は、それを使用する
            if (tokenTenantId) {
                azureConfig.tenantId = tokenTenantId;
            }

            log(
                "fluidService",
                "info",
                `Using Azure Fluid Relay with token for user: ${fluidToken.user.name} and tenantId: ${azureConfig.tenantId}`,
            );

            // コンテナID制限のログ出力
            if (fluidToken.containerId) {
                log("fluidService", "debug", `Token is scoped to container: ${fluidToken.containerId}`);
            }

            return {
                fetchOrdererToken: async () => {
                    return {
                        jwt: fluidToken.token,
                        fromCache: true,
                    };
                },
                fetchStorageToken: async () => {
                    return {
                        jwt: fluidToken.token,
                        fromCache: true,
                    };
                },
            };
        }
        else {
            log("fluidService", "warn", "No Fluid token available for Azure mode, fallback to insecure provider");
        }
    }

    // Tinyliciousモードまたはトークンが無い場合はInsecureTokenProviderを使用
    const userName = userId ? `User-${userId}` : "Anonymous";
    log("fluidService", "info", `Using InsecureTokenProvider for user: ${userName}`);
    return new InsecureTokenProvider(
        useTinylicious ? "tinylicious" : azureConfig.tenantId,
        { id: userId || "anonymous" },
    );
}

// AzureClientの取得（またはTinyliciousClient）
async function getFluidClient(userId?: string, containerId?: string): Promise<FluidInstances> {
    if (useTinylicious) {
        const port = parseInt(import.meta.env.VITE_TINYLICIOUS_PORT || process.env.VITE_TINYLICIOUS_PORT || "7082");
        const client = new TinyliciousClient({ connection: { port } });
        // const client = new TinyliciousClient({ connection: { port: 7082 } });
        const createResponse = await client.createContainer(containerSchema, "2");
        const container = createResponse.container;
        const containerID = await container.attach();
        saveContainerId(containerID);
        const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
        appData.initialize(Project.createInstance("Test Project"));
        const project = appData.root as Project;
        for (let i = 0; i < 3; i++) {
            const page = project.addPage("Test Page", "test-user");
            for (let j = 0; j < 3; j++) {
                (page.items as Items).addNode("test-user");
            }
        }

        return [client, container, createResponse.services, appData, project];
    }

    // クライアントキーを生成
    const clientKey = createClientKey(userId, containerId);

    // 既存クライアントがあれば返す
    if (containerId && clientRegistry.has(clientKey)) {
        return clientRegistry.get(clientKey)!;
    }

    let tokenProvider;
    try {
        // TokenProvider設定 - コンテナIDが指定されている場合はそれも渡す
        tokenProvider = await getTokenProvider(userId, containerId);
    }
    catch (error) {
        log(
            "fluidService",
            "error",
            `Failed to getTokenProvider. retry without containerId. ${clientKey.type}:${clientKey.id}:`,
            error,
        );
        containerId = undefined; // コンテナIDをクリアして再試行
        tokenProvider = await getTokenProvider(userId);
    }

    // Azure Fluid Relay（本番環境）用の設定
    const connectionConfig: AzureRemoteConnectionConfig = {
        type: "remote",
        tenantId: azureConfig.tenantId,
        tokenProvider: tokenProvider,
        endpoint: azureConfig.endpoint,
    };

    const clientProps = {
        connection: connectionConfig,
    };

    try {
        // 新しいAzure Clientを作成して登録
        log("fluidService", "info", `Creating new Fluid client for ${clientKey.type}:${clientKey.id}`);
        const client = new AzureClient(clientProps);

        // コンテナIDがある場合はコンテナをロード、なければ新規作成
        let container: IFluidContainer | undefined = undefined;
        let services: AzureContainerServices | undefined = undefined;
        let appData: TreeView<typeof Project> | undefined = undefined;
        let project: Project | undefined = undefined;

        if (containerId) {
            // 既存のコンテナに接続
            log("fluidService", "info", `Loading existing container: ${containerId}`);
            const getResponse = await client.getContainer(containerId, containerSchema, "2");
            container = getResponse.container;
            services = getResponse.services;
            appData = (container!.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);

            if (appData.compatibility.canInitialize) {
                log("fluidService", "warn", "Something wrong with the container, initializing new project");
                appData.initialize(Project.createInstance("新規プロジェクト"));
            }
            project = appData.root as Project;
        }

        const result: FluidInstances = [client, container, services, appData, project];

        clientRegistry.set(clientKey, result as any);
        return result;
    }
    catch (error) {
        log("fluidService", "error", `Failed to create Fluid client for ${clientKey.type}:${clientKey.id}:`, error);
        throw error;
    }
}

// ローカルストレージのキー名
const CONTAINER_ID_STORAGE_KEY = "fluid_container_id";

/**
 * ローカルストレージからコンテナIDを読み込む
 * @returns 保存されていたコンテナID、なければundefined
 */
function loadContainerId(): string | undefined {
    if (typeof window !== "undefined") {
        const savedContainerId = localStorage.getItem(CONTAINER_ID_STORAGE_KEY);
        if (savedContainerId) {
            log("fluidService", "info", `Loading saved container ID: ${savedContainerId}`);
            return savedContainerId;
        }
    }
    return undefined;
}

/**
 * コンテナIDをローカルストレージに保存
 * @param containerId 保存するコンテナID
 */
function saveContainerId(containerId: string): void {
    if (typeof window !== "undefined") {
        log("fluidService", "info", `Saving container ID locally: ${containerId}`);
        localStorage.setItem(CONTAINER_ID_STORAGE_KEY, containerId);
    }
}

/**
 * コンテナIDをサーバー側に保存する
 * @param containerId 保存するコンテナID
 */
async function saveContainerIdToServer(containerId: string): Promise<boolean> {
    try {
        // バレルパターンを使用して関数を呼び出し
        const result = await saveFirestoreContainerIdToServer(containerId);

        if (!result) {
            log("fluidService", "warn", "Failed to save container ID to server");
        }
        else {
            log("fluidService", "info", `Successfully saved container ID: ${containerId}`);
        }
        return result;
    }
    catch (error) {
        log("fluidService", "error", "Error saving container ID to server:", error);
        // エラーが発生してもクリティカルではないので、処理は続行
        return false;
    }
}

/**
 * 新しいFluidコンテナを作成し、初期化されたFluidClientインスタンスを返す
 * @param containerName 作成するコンテナの名前（メタデータとして保存）
 * @returns 初期化されたFluidClientインスタンス
 */
export async function createNewContainer(containerName: string): Promise<FluidClient> {
    try {
        log("fluidService", "info", `Creating a new container: ${containerName}`);

        // ユーザー情報を取得
        const userManager = UserManager.getInstance();
        const userInfo = userManager.getFluidUserInfo();
        const userId = userInfo?.id;

        if (!userId) {
            throw new Error("ユーザーがログインしていないため、新規コンテナを作成できません");
        }

        const clientId = uuid();

        // Fluid Frameworkのクライアントを初期化
        const [client] = await getFluidClient(userId, "");

        // 新規コンテナを作成
        log("fluidService", "info", "Creating container with schema");
        const createResponse = await client.createContainer(containerSchema, "2");
        const container = createResponse.container;

        // コンテナをアタッチして永続化（コンテナIDを取得）
        log("fluidService", "info", "Attaching container");
        const newContainerId = await container.attach();
        log("fluidService", "info", `Container created with ID: ${newContainerId}`);

        // サーバーとローカルストレージにコンテナIDを保存
        await saveContainerIdToServer(newContainerId);
        saveContainerId(newContainerId);

        // 新しいFluidクライアントを取得
        const [_, updatedContainer, updatedServices, appData, project] = await getFluidClient(
            userId,
            newContainerId,
        );

        if (!updatedContainer || !appData || !project) {
            throw new Error("FluidClientの初期化に失敗しました");
        }

        if (appData.compatibility.canInitialize) {
            appData.initialize(Project.createInstance(containerName || "新規プロジェクト"));
        }

        // 初期データとして最初のページを作成
        const projectRoot = appData.root as Project;
        projectRoot.addPage("はじめてのページ", userId);

        // 必要な全てのパラメータを設定してFluidClientインスタンスを作成
        const fluidClientParams = {
            clientId,
            client,
            container: updatedContainer,
            containerId: newContainerId,
            appData,
            project: projectRoot,
            services: updatedServices,
        };

        // 新しいFluidClientインスタンスを返す
        return new FluidClient(fluidClientParams);
    }
    catch (error) {
        log("fluidService", "error", "Failed to create new container:", error);
        throw error;
    }
}

/**
 * 特定のコンテナIDを使用してコンテナをロードし、新しいFluidClientインスタンスを返します
 * @param containerId ロードするコンテナID
 * @returns 初期化されたFluidClientインスタンス
 */
export async function loadContainer(containerId: string): Promise<any> {
    if (!containerId) {
        throw new Error("コンテナIDが指定されていません");
    }

    // 特定のコンテナIDでFluidClientを作成
    return createFluidClient(containerId);
}

/**
 * FluidClientインスタンスを作成する
 * すべてのプロパティが初期化されたインスタンスを返す
 * @param containerId 既存のコンテナID（省略すると新規作成かローカルストレージから復元）
 * @returns 完全に初期化されたFluidClientインスタンス
 */
export async function createFluidClient(containerId?: string): Promise<FluidClient> {
    try {
        log("fluidService", "info", "Creating new FluidClient instance...");

        // クライアントIDを生成
        const clientId = uuid();

        // ユーザー情報を取得
        const userManager = UserManager.getInstance();
        const userInfo = userManager.getFluidUserInfo();
        const userId = userInfo?.id;

        if (!userId) {
            throw new Error("ユーザーがログインしていないため、Fluidクライアントを作成できません");
        }

        // コンテナIDが指定されていない場合はローカルストレージから読み込みを試みる
        let resolvedContainerId = containerId;
        if (!resolvedContainerId) {
            resolvedContainerId = loadContainerId();

            // ローカルストレージからも取得できない場合はFirestoreから取得を試みる
            if (!resolvedContainerId) {
                const defaultId = await getDefaultContainerId();
                // nullは許容しないようにundefinedに変換
                resolvedContainerId = defaultId || undefined;
            }
        }

        // コンテナIDが解決できた場合は既存のコンテナをロード
        if (resolvedContainerId) {
            log("fluidService", "info", `Loading existing container with ID: ${resolvedContainerId}`);

            // Fluidクライアントを取得
            const [client, container, services, appData, project] = await getFluidClient(
                userId,
                resolvedContainerId,
            );

            if (!container || !appData || !project) {
                throw new Error("コンテナのロードに失敗しました");
            }

            // 必要な全てのパラメータを設定してFluidClientインスタンスを作成
            const fluidClientParams = {
                clientId,
                client,
                container,
                containerId: resolvedContainerId,
                appData,
                project,
                services,
            };

            // 新しいFluidClientインスタンスを返す
            return new FluidClient(fluidClientParams);
        }
        else {
            // コンテナIDが取得できない場合は新規コンテナを作成
            log("fluidService", "info", "No container ID available, creating a new container");

            // Fluidクライアントの取得
            const [client] = await getFluidClient(userId, "");

            // 新規コンテナを作成
            const createResponse = await client.createContainer(containerSchema, "2");
            const container = createResponse.container;
            const services = createResponse.services;

            // コンテナをアタッチして永続化
            const newContainerId = await container.attach();
            log("fluidService", "info", `Created new container with ID: ${newContainerId}`);

            // サーバーとローカルストレージにコンテナIDを保存
            await saveContainerIdToServer(newContainerId);
            saveContainerId(newContainerId);

            // SharedTreeデータを初期化
            const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);

            if (appData.compatibility.canInitialize) {
                appData.initialize(Project.createInstance("新規プロジェクト"));
            }

            // 初期データとして最初のページを作成
            const project = appData.root as Project;
            const root = project.addPage("はじめてのページ", userId);
            (root.items as Items).addNode("");

            // 必要な全てのパラメータを設定してFluidClientインスタンスを作成
            const fluidClientParams = {
                clientId,
                client,
                container,
                containerId: newContainerId,
                appData,
                project,
                services,
            };

            // 新しいFluidClientインスタンスを返す
            return new FluidClient(fluidClientParams);
        }
    }
    catch (error) {
        log("fluidService", "error", "Failed to create FluidClient:", error);
        throw error;
    }
}

let unsubscribeAuth: (() => void) | null = null;

// ユーザー認証状態の変更を監視して、FluidClientを初期化/更新する
export async function initFluidClientWithAuth() {
    const userManager = UserManager.getInstance();

    // 認証状態の変更を監視
    unsubscribeAuth = userManager.addEventListener(async authResult => {
        try {
            if (authResult) {
                logger.info("認証成功により、Fluidクライアントを初期化します");

                // FluidClientのファクトリーメソッドを使用して新しいインスタンスを作成
                const client = await createFluidClient();

                // Storeに保存
                fluidStore.fluidClient = client;

                // デバッグ用にグローバル変数に設定
                if (typeof window !== "undefined") {
                    (window as any).__FLUID_CLIENT__ = client;
                }
            }
            else {
                logger.info("ログアウトにより、Fluidクライアントをリセットします");
                // ストアからの参照を削除
                fluidStore.fluidClient = undefined;
                if (typeof window !== "undefined") {
                    delete (window as any).__FLUID_CLIENT__;
                }
            }
        }
        catch (error) {
            logger.error("FluidClient初期化エラー:", error);
            fluidStore.fluidClient = undefined;
        }
    });

    // 既に認証済みの場合は初期化を試行
    const currentUser = userManager.getCurrentUser();
    if (currentUser) {
        try {
            // FluidClientのファクトリーメソッドを使用して新しいインスタンスを作成
            const client = await createFluidClient();
            fluidStore.fluidClient = client;

            if (typeof window !== "undefined") {
                (window as any).__FLUID_CLIENT__ = client;
            }
        }
        catch (error) {
            logger.error("既存ユーザーでのFluidClient初期化エラー:", error);
        }
    }
}

// クリーンアップ関数
export function cleanupFluidClient() {
    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }

    // 現在のクライアントをクリーンアップ
    if (fluidStore.fluidClient?.container) {
        try {
            // クライアントが接続状態のイベントハンドラを持っていれば解除
            fluidStore.fluidClient.container.off("connected", () => {});
            fluidStore.fluidClient.container.off("disconnected", () => {});
        }
        catch (e) {
            logger.warn("FluidClient接続解除中のエラー:", e);
        }
    }
    fluidStore.fluidClient = undefined;
}
