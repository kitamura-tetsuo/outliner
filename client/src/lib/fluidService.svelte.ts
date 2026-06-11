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
    Tree,
    type TreeView,
    type ViewableTree,
} from "fluid-framework";
import { SvelteMap } from "svelte/reactivity";
import { v4 as uuid } from "uuid";
import { userManager } from "../auth/UserManager";
import { FluidClient } from "../fluid/fluidClient";
import {
    appTreeConfiguration,
    Project,
} from "../schema/app-schema";
import {
    getDefaultContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
} from "../stores/firestoreStore.svelte";
import { fluidStore } from "../stores/fluidStore.svelte";
import { CustomKeyMap } from "./CustomKeyMap";
import {
    createFluidConfigProvider,
    getTelemetryFilterLogger,
} from "./fluidTelemetryFilter";
import { AsyncLockManager } from "./lock";
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

class GeneralStore {
    titleRegistry = new SvelteMap<string, string>();
}
export const firestoreStore = new GeneralStore();

// シングルトンからマップ型に変更して複数クライアントを管理
const clientRegistry = new CustomKeyMap<FluidClientKey, FluidInstances>();

// Azure Fluid Relayエンドポイント設定
const azureConfig = {
    tenantId: import.meta.env.VITE_AZURE_TENANT_ID || "00000000-0000-0000-0000-000000000000",
    endpoint: import.meta.env.VITE_AZURE_FLUID_RELAY_ENDPOINT || "https://us.fluidrelay.azure.com",
};

// 開発環境ではTinyliciousを使用する - 環境変数で強制的に切り替え可能
const isTestEnvironment = import.meta.env.VITE_IS_TEST === "true" ||
    import.meta.env.MODE === "test" || process.env.NODE_ENV === "test";
const useTinylicious = isTestEnvironment || // テスト環境では常にTinyliciousを使用
    import.meta.env.VITE_USE_TINYLICIOUS === "true" ||
    (import.meta.env.DEV && import.meta.env.VITE_FORCE_AZURE !== "true");

// Fluid Frameworkがパスの不一致によるエラーを回避するため、
// ContainerSchemaを直接インポートせずにオブジェクトとして定義
export const containerSchema: ContainerSchema = {
    initialObjects: {
        appData: SharedTree,
    },
} as any satisfies ContainerSchema;

const lockManager = new AsyncLockManager();

// キー生成ロジックを一元化する関数
function createClientKey(userId?: string, containerId?: string): FluidClientKey {
    if (containerId) {
        return { type: "container", id: containerId };
    }
    return { type: "user", id: userId || "anonymous" };
}

async function loadTitle(containerId?: string) {
    if (!containerId) return;

    const instances = await getFluidClient(containerId);
    Tree.on(instances[4]!, "nodeChanged", () => {
        firestoreStore.titleRegistry.set(containerId, title);
    });
    const title = instances[4]!.title;
    return firestoreStore.titleRegistry.set(containerId, title);
    // return firestoreStore.titleRegistry.set(containerId, $state(title));
}
export function getProjectTitle(containerId: string): string {
    const title = firestoreStore.titleRegistry.get(containerId);
    if (!title) loadTitle(containerId);

    return title || "";
}

// TokenProviderの取得
async function getTokenProvider(userId?: string, containerId?: string): Promise<ITokenProvider> {
    if (!useTinylicious) {
        // Azureモードの場合はUserManagerからトークンを取得

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

async function createAzureOrTinyliciousClient(
    userId?: string,
    containerId?: string,
): Promise<TinyliciousClient | AzureClient> {
    if (useTinylicious) {
        const port = parseInt(import.meta.env.VITE_TINYLICIOUS_PORT || process.env.VITE_TINYLICIOUS_PORT || "7082");
        // telemetryを無効化するための設定を追加
        const client = new TinyliciousClient({
            connection: { port },
            logger: getTelemetryFilterLogger(), // telemetryをフィルタリングするカスタムロガー
            // configProvider: createFluidConfigProvider(), // telemetry関連の機能を無効化する設定
        });
        return client;
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
            `Failed to getTokenProvider. retry without containerId. ${userId}:${containerId}:`,
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

    // telemetryを無効化するための設定を追加
    const clientProps = {
        connection: connectionConfig,
        logger: getTelemetryFilterLogger(), // telemetryをフィルタリングするカスタムロガー
        configProvider: createFluidConfigProvider(), // telemetry関連の機能を無効化する設定
    };
    const client = new AzureClient(clientProps);
    return client;
}

// AzureClientの取得（またはTinyliciousClient）
export async function getFluidClient(containerId?: string): Promise<FluidInstances> {
    // if (useTinylicious) {
    //     const port = parseInt(import.meta.env.VITE_TINYLICIOUS_PORT || process.env.VITE_TINYLICIOUS_PORT || "7082");
    //     // telemetryを無効化するための設定を追加
    //     const client = new TinyliciousClient({
    //         connection: { port },
    //         logger: getTelemetryFilterLogger(), // telemetryをフィルタリングするカスタムロガー
    //         // configProvider: createFluidConfigProvider(), // telemetry関連の機能を無効化する設定
    //     });
    //     const createResponse = await client.createContainer(containerSchema, "2");
    //     const container = createResponse.container;
    //     const containerID = await container.attach();
    //     saveContainerId(containerID);
    //     const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
    //     appData.initialize(Project.createInstance("Test Project"));
    //     const project = appData.root as Project;
    //     for (let i = 0; i < 3; i++) {
    //         const page = project.addPage("Test Page", "test-user");
    //         for (let j = 0; j < 3; j++) {
    //             (page.items as Items).addNode("test-user");
    //         }
    //     }

    //     return [client, container, createResponse.services, appData, project];
    // }

    return lockManager.runExclusive("getFluidClient", async () => {
        const user = userManager.getCurrentUser();
        // クライアントキーを生成
        const clientKey = createClientKey(user?.id, containerId);

        // 既存クライアントがあれば返す
        if (containerId && clientRegistry.has(clientKey)) {
            return clientRegistry.get(clientKey)!;
        }

        try {
            // 新しいAzure Clientを作成して登録
            log("fluidService", "info", `Creating new Fluid client for ${clientKey.type}:${clientKey.id}`);
            const client = await createAzureOrTinyliciousClient(user?.id, containerId);

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

            clientRegistry.set(clientKey, result);
            loadTitle(containerId);
            return result;
        }
        catch (error) {
            log("fluidService", "error", `Failed to create Fluid client for ${clientKey.type}:${clientKey.id}:`, error);
            throw error;
        }
    });
}

// ローカルストレージのキー名
const CONTAINER_ID_STORAGE_KEY = "fluid_container_id";

/**
 * ローカルストレージからコンテナIDを読み込む
 * @returns 保存されていたコンテナID、なければundefined
 */
function loadContainerId(): string | undefined {
    if (isTestEnvironment) return undefined;
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
 * ユーザーがアクセス可能なコンテナIDのリストを取得する
 * @returns コンテナIDのリストとデフォルトコンテナID
 */
export async function getUserContainers(): Promise<{ containers: string[]; defaultContainerId: string | null; }> {
    try {
        // ユーザー情報を取得
        const userInfo = userManager.getCurrentUser();
        const userId = userInfo?.id;

        if (!userId) {
            throw new Error("ユーザーがログインしていないため、コンテナリストを取得できません");
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            throw new Error("認証トークンを取得できません");
        }

        // Firebase Functionsのエンドポイントを取得
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        log("fluidService", "info", `Getting user containers from Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナリストを取得
        const response = await fetch(`${apiBaseUrl}/api/get-user-containers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        log("fluidService", "info", `Successfully got user containers for user ${userId}`);
        return {
            containers: result.containers || [],
            defaultContainerId: result.defaultContainerId || null,
        };
    }
    catch (error) {
        log("fluidService", "error", "Error getting user containers:", error);
        return { containers: [], defaultContainerId: null };
    }
}

/**
 * コンテナを削除する
 * @param containerId 削除するコンテナID
 * @returns 削除が成功したかどうか
 */
export async function deleteContainer(containerId: string): Promise<boolean> {
    try {
        // ユーザー情報を取得

        const userInfo = userManager.getCurrentUser();
        const userId = userInfo?.id;

        if (!userId) {
            throw new Error("ユーザーがログインしていないため、コンテナを削除できません");
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            throw new Error("認証トークンを取得できません");
        }

        // Firebase Functionsのエンドポイントを取得
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        log("fluidService", "info", `Deleting container ${containerId} via Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナを削除
        const response = await fetch(`${apiBaseUrl}/api/delete-container`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ idToken, containerId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        log("fluidService", "info", `Successfully deleted container ${containerId}`);
        return result.success === true;
    }
    catch (error) {
        log("fluidService", "error", `Error deleting container ${containerId}:`, error);
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
        const userInfo = userManager.getFluidUserInfo();
        const userId = userInfo?.id;

        if (!userId) {
            throw new Error("ユーザーがログインしていないため、新規コンテナを作成できません");
        }

        const clientId = uuid();

        // Fluid Frameworkのクライアントを初期化
        const [client] = await getFluidClient("");

        // 新規コンテナを作成
        log("fluidService", "info", "Creating container with schema");
        const createResponse = await client.createContainer(containerSchema, "2");
        const container = createResponse.container;

        // コンテナをアタッチして永続化（コンテナIDを取得）
        log("fluidService", "info", "Attaching container");
        const containerId = await container.attach();
        log("fluidService", "info", `Container created with ID: ${containerId}`);

        const appData = (container!.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);
        appData.initialize(Project.createInstance(containerName));
        const project = appData.root as Project;

        const result: FluidInstances = [client, container, createResponse.services, appData, project];
        const clientKey = createClientKey(userId, containerId);
        clientRegistry.set(clientKey, result);
        loadTitle(containerId);

        // 必要な全てのパラメータを設定してFluidClientインスタンスを作成
        const fluidClientParams = {
            clientId,
            client,
            container,
            containerId,
            appData,
            project,
            services: createResponse.services,
        };

        // サーバーとローカルストレージにコンテナIDを保存
        await saveContainerIdToServer(containerId);
        saveContainerId(containerId);

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
 * プロジェクトタイトルからFluidClientインスタンスを取得する
 * clientRegistryを走査して、Project.titleが一致するFluidClientを返す
 * @param projectTitle プロジェクトタイトル
 * @returns 初期化されたFluidClientインスタンス、見つからない場合はundefined
 */
export async function getFluidClientByProjectTitle(projectTitle: string): Promise<FluidClient | undefined> {
    if (!projectTitle) {
        throw new Error("プロジェクトタイトルが指定されていません");
    }

    log("fluidService", "info", `プロジェクトタイトルからFluidClientを取得: ${projectTitle}`);

    // clientRegistryを走査して、Project.titleが一致するFluidClientを探す
    const keys = clientRegistry.getAllKeys();
    log("fluidService", "debug", `clientRegistryのキー数: ${keys.length}`);

    for (const key of keys) {
        const instances = clientRegistry.get(key);
        if (!instances) continue;

        // FluidInstancesの5番目の要素がProject
        const [client, container, services, appData, project] = instances;

        log("fluidService", "debug", `プロジェクトを確認中: ${project?.title} (キー: ${key.id})`);

        if (project && project.title === projectTitle) {
            log(
                "fluidService",
                "info",
                `プロジェクトタイトル「${projectTitle}」に一致するFluidClientを発見: ${key.id}`,
            );

            // 必要なプロパティが存在することを確認
            if (!container || !appData) {
                log(
                    "fluidService",
                    "error",
                    `FluidInstancesに必要なプロパティが不足しています: container=${!!container}, appData=${!!appData}`,
                );
                continue;
            }

            // 既存のFluidInstancesから直接FluidClientを作成
            const clientId = uuid();
            const fluidClientParams = {
                clientId,
                client,
                container,
                containerId: key.id,
                appData,
                project,
                services,
            };

            return new FluidClient(fluidClientParams);
        }
    }

    log("fluidService", "warn", `プロジェクトタイトル「${projectTitle}」に一致するFluidClientが見つかりませんでした`);
    log(
        "fluidService",
        "debug",
        `利用可能なプロジェクト: ${
            keys.map(key => {
                const instances = clientRegistry.get(key);
                return instances?.[4]?.title || "unknown";
            }).join(", ")
        }`,
    );
    return undefined;
}

/**
 * FluidClientインスタンスを作成する
 * すべてのプロパティが初期化されたインスタンスを返す
 * @param containerId 既存のコンテナID（省略すると新規作成かローカルストレージから復元）
 * @returns 完全に初期化されたFluidClientインスタンス
 */
export async function createFluidClient(containerId?: string): Promise<FluidClient> {
    return lockManager.runExclusive("createFluidClient", async () => {
        try {
            log("fluidService", "info", "Creating new FluidClient instance...");

            // クライアントIDを生成
            const clientId = uuid();

            // ユーザー情報を取得
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
            // else {
            //     // コンテナIDが取得できない場合は新規コンテナを作成
            //     log("fluidService", "info", "No container ID available, creating a new container");

            //     // Fluidクライアントの取得
            //     const [client] = await getFluidClient(userId, "");

            //     // 新規コンテナを作成
            //     const createResponse = await client.createContainer(containerSchema, "2");
            //     const container = createResponse.container;
            //     const services = createResponse.services;

            //     // コンテナをアタッチして永続化
            //     const newContainerId = await container.attach();
            //     log("fluidService", "info", `Created new container with ID: ${newContainerId}`);

            //     // サーバーとローカルストレージにコンテナIDを保存
            //     await saveContainerIdToServer(newContainerId);
            //     saveContainerId(newContainerId);

            //     // SharedTreeデータを初期化
            //     const appData = (container.initialObjects.appData as ViewableTree).viewWith(appTreeConfiguration);

            //     if (appData.compatibility.canInitialize) {
            //         appData.initialize(Project.createInstance("新規プロジェクト"));
            //     }

            //     // 初期データとして最初のページを作成
            //     const project = appData.root as Project;
            //     const root = project.addPage("はじめてのページ", userId);
            //     (root.items as Items).addNode("");

            //     // 必要な全てのパラメータを設定してFluidClientインスタンスを作成
            //     const fluidClientParams = {
            //         clientId,
            //         client,
            //         container,
            //         containerId: newContainerId,
            //         appData,
            //         project,
            //         services,
            //     };

            //     // 新しいFluidClientインスタンスを返す
            //     return new FluidClient(fluidClientParams);
            // }
        }
        catch (error) {
            log("fluidService", "error", "Failed to create FluidClient:", error);
            throw error;
        }
    });
}

let unsubscribeAuth: (() => void) | null = null;

// ユーザー認証状態の変更を監視して、FluidClientを初期化/更新する
export async function initFluidClientWithAuth() {
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
