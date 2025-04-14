import { initializeApp } from "firebase/app";
import {
    connectFirestoreEmulator,
    doc,
    getDoc,
    getFirestore,
    onSnapshot,
} from "firebase/firestore";
import {
    get,
    type Writable,
    writable,
} from "svelte/store";
import { UserManager } from "../auth/UserManager";
import { getLogger } from "../lib/logger";
const logger = getLogger();

// Firebaseの設定情報はUserManagerから取得
const userManager = UserManager.getInstance();
const firebaseConfig = {
    apiKey: "AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
    authDomain: "outliner-d57b0.firebaseapp.com",
    projectId: "outliner-d57b0",
    storageBucket: "outliner-d57b0.firebasestorage.app",
    messagingSenderId: "560407608873",
    appId: "1:560407608873:web:147817f4a93a4678606638",
    measurementId: "G-FKSFRCT7GR",
};

// ユーザーコンテナの型定義
export interface UserContainer {
    userId: string;
    defaultContainerId?: string;
    accessibleContainerIds?: string[];
    createdAt: Date;
    updatedAt: Date;
}

// ユーザーコンテナのストア
export const userContainer: Writable<UserContainer | null> = writable(null);

// Firestoreアプリとデータベースの初期化
let app;
let db;

// Firebaseアプリの初期化（一度だけ）
try {
    try {
        app = initializeApp(firebaseConfig);
        logger.info("Firebase app initialized successfully");
    }
    catch (e) {
        // すでに初期化されている場合は既存のアプリを使用
        logger.info("Firebase app already initialized, reusing existing instance");
    }

    // Firestoreインスタンスの取得
    db = getFirestore(app);

    // テスト環境またはエミュレータ環境を検出して接続
    const isTestEnv = import.meta.env.MODE === "test" ||
        process.env.NODE_ENV === "test" ||
        import.meta.env.VITE_IS_TEST === "true" ||
        (typeof window !== "undefined" && window.mockFluidClient === false);

    const useEmulator = isTestEnv ||
        import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" ||
        (typeof window !== "undefined" &&
            window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true");

    // Firebase Emulatorに接続
    if (useEmulator) {
        // Firestoreエミュレーターのホストと設定
        // 開発環境では通常は192.168.50.13を利用（ローカルIPアドレス）
        // コンテナ名が指定されている場合は転送設定があるはず
        let emulatorHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;
        // ホスト名が指定されていない場合、もしくは 'firebase-emulator', 'localhost', '127.0.0.1' の場合は
        // 実際のIPアドレスを使用

        const emulatorPort = parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "6480", 10);

        // エミュレーター接続情報をログに出力
        logger.info(`Connecting to Firestore emulator at ${emulatorHost}:${emulatorPort}`);

        try {
            // エミュレーターに接続
            connectFirestoreEmulator(db, emulatorHost, emulatorPort);
            logger.info("Successfully connected to Firestore emulator");
        }
        catch (err) {
            logger.error("Failed to connect to Firestore emulator:", err);

            // 接続できない場合はオフラインモードで続行することを通知
            logger.warn("Continuing in offline mode. Data operations will be cached until connection is restored.");
        }
    }
}
catch (error) {
    logger.error("Critical error initializing Firestore:", error);
    // データベース接続に失敗した場合でもアプリが動作し続けられるように
    // 最低限の初期化だけを行う
    if (!db) {
        db = getFirestore(app);
    }
}

// リスナーの解除関数
let unsubscribe: (() => void) | null = null;

// Firestoreとの同期を開始する関数
export function initFirestoreSync(): () => void {
    // 以前のリスナーがあれば解除
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    const currentUser = userManager.getCurrentUser();
    // ユーザーがログインしていない場合は早期リターン
    if (!currentUser) {
        logger.info("ユーザーがログインしていないため、Firestoreの監視を開始しません");
        return () => {}; // 空のクリーンアップ関数を返す
    }

    // ユーザーIDの存在確認を追加
    if (!currentUser.id) {
        logger.warn("ユーザーオブジェクトにIDがないため、Firestoreの監視を開始しません");
        return () => {}; // 空のクリーンアップ関数を返す
    }

    const userId = currentUser.id;
    logger.info(`ユーザー ${userId} の userContainers ドキュメントを監視します`);

    try {
        // ドキュメントへの参照を取得 (/userContainers/{userId})
        const userContainerRef = doc(db, "userContainers", userId);

        // エラーハンドリングを強化したリアルタイム更新リスナー
        unsubscribe = onSnapshot(
            userContainerRef,
            snapshot => {
                if (snapshot.exists()) {
                    const data = snapshot.data();

                    const containerData: UserContainer = {
                        userId: data.userId,
                        defaultContainerId: data.defaultContainerId,
                        accessibleContainerIds: data.accessibleContainerIds || [],
                        createdAt: data.createdAt?.toDate() || new Date(),
                        updatedAt: data.updatedAt?.toDate() || new Date(),
                    };

                    userContainer.set(containerData);
                    logger.info(`ユーザー ${userId} のコンテナ情報を読み込みました`);
                    logger.info(`デフォルトコンテナID: ${containerData.defaultContainerId || "なし"}`);
                }
                else {
                    // Tinyliciousテスト環境ではテスト用データをセットアップ
                    if (!setupTinyliciousTestContainers()) {
                        userContainer.set(null);
                    }
                    else {
                        logger.info(`ユーザー ${userId} のコンテナ情報は存在しません`);
                    }
                }
            },
            error => {
                logger.error("Firestoreのリスニングエラー:", error);

                // エラーが発生した場合でもTinyliciousテスト環境ではテスト用データをセットアップ
                if (!setupTinyliciousTestContainers()) {
                    userContainer.set(null);
                }
            },
        );

        // クリーンアップ関数を返す
        return () => {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        };
    }
    catch (error) {
        logger.error("Firestore監視設定エラー:", error);

        // エラーが発生した場合でもTinyliciousテスト環境ではテスト用データをセットアップ
        setupTinyliciousTestContainers();

        return () => {}; // 空のクリーンアップ関数を返す
    }
}

// サーバーAPIを使ってコンテナIDを保存（更新はサーバーサイドでのみ行う）
export async function saveContainerId(containerId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            throw new Error("ユーザーがログインしていません");
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            throw new Error("認証トークンを取得できません");
        }

        // サーバーAPIを呼び出してコンテナIDを保存
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:7071";
        const response = await fetch(`${apiBaseUrl}/api/save-container`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.success === true;
    }
    catch (error) {
        logger.error("コンテナID保存エラー:", error);
        return false;
    }
}

// デフォルトコンテナIDを取得
export async function getDefaultContainerId(): Promise<string | undefined> {
    try {
        // ユーザーがログインしていることを確認
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.info("Cannot get default container ID: User not logged in. Waiting for login...");
            return undefined;
        }

        // 1. まずストアから直接取得を試みる（リアルタイム更新されている場合）
        const containerData = get(userContainer);
        if (containerData?.defaultContainerId) {
            logger.info(`Found default container ID in store: ${containerData.defaultContainerId}`);
            return containerData.defaultContainerId;
        }

        // 2. ストアに値がない場合は直接Firestoreから取得
        try {
            logger.info("No default container found in store, fetching from server...");
            const userId = currentUser.id;

            // Firestoreのimport確認
            if (!db) {
                logger.error("Firestore db is not initialized");
                return undefined;
            }

            const userContainerRef = doc(db, "userContainers", userId);
            const snapshot = await getDoc(userContainerRef);

            if (snapshot.exists()) {
                const data = snapshot.data();
                const containerId = data.defaultContainerId;
                if (containerId) {
                    logger.info(`Found default container ID from Firestore: ${containerId}`);
                    return containerId;
                }
            }
        }
        catch (firestoreError) {
            logger.error("Firestore access error:", firestoreError);
            // Firestoreエラーは致命的ではないので、続行
        }

        logger.info("No default container ID found");
        return undefined;
    }
    catch (error) {
        logger.error("デフォルトコンテナID取得エラー:", error);
        return undefined;
    }
}

// E2E テスト環境で使用するための Tinylicious コンテナデータをセットアップする
function setupTinyliciousTestContainers() {
    // テスト環境かつ Tinylicious モードの場合
    if (
        (typeof window !== "undefined" &&
            (window.mockFluidClient === false || // 明示的に mockFluidClient=false の場合（実際の Tinylicious 接続）
                (import.meta.env.VITE_USE_TINYLICIOUS === "true" ||
                    window.localStorage.getItem("VITE_USE_TINYLICIOUS") === "true")))
    ) {
        logger.info("Setting up Tinylicious test containers");

        // テスト用のコンテナデータを作成
        const testContainerId = window.localStorage.getItem("currentContainerId") || "test-container-id";

        // ユーザーコンテナにテスト用のデータをセット
        userContainer.set({
            userId: "test-user-id",
            defaultContainerId: testContainerId,
            accessibleContainerIds: [testContainerId],
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return true;
    }

    return false;
}

// ユーザーのコンテナリストを取得
export async function getUserContainers(): Promise<{ id: string; name?: string; isDefault?: boolean; }[]> {
    try {
        // E2E テスト環境の場合は Tinylicious 用のテストコンテナを使用
        if (setupTinyliciousTestContainers()) {
            const containerData = get(userContainer);
            if (containerData) {
                const containers = [];

                // デフォルトコンテナがあれば追加
                if (containerData.defaultContainerId) {
                    containers.push({
                        id: containerData.defaultContainerId,
                        name: "Tinylicious テストコンテナ",
                        isDefault: true,
                    });
                }

                // その他のアクセス可能なコンテナも追加
                if (containerData.accessibleContainerIds && containerData.accessibleContainerIds.length > 0) {
                    const additionalContainers = containerData.accessibleContainerIds
                        .filter(id => id !== containerData.defaultContainerId)
                        .map(id => ({
                            id,
                            name: `テストコンテナ ${id.substring(0, 8)}...`,
                            isDefault: false,
                        }));

                    containers.push(...additionalContainers);
                }

                return containers;
            }
        }

        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("getUserContainers: ユーザーがログインしていません");
            return [];
        }

        // Svelte ストアから取得を試みる
        const containerData = get(userContainer);
        if (containerData) {
            const containers = [];

            // デフォルトコンテナがあれば優先的に追加
            if (containerData.defaultContainerId) {
                containers.push({
                    id: containerData.defaultContainerId,
                    name: "デフォルトコンテナ",
                    isDefault: true,
                });
            }

            // アクセス可能なコンテナIDリストがあれば追加
            if (containerData.accessibleContainerIds && containerData.accessibleContainerIds.length > 0) {
                // デフォルトコンテナと重複しないようにフィルタリング
                const additionalContainers = containerData.accessibleContainerIds
                    .filter(id => id !== containerData.defaultContainerId)
                    .map(id => ({
                        id,
                        name: `コンテナ ${id.substring(0, 8)}...`, // IDの一部を表示
                        isDefault: false,
                    }));

                containers.push(...additionalContainers);
            }

            return containers;
        }

        // ストアに値がない場合は直接Firestoreから取得
        const userId = currentUser.id;
        const userContainerRef = doc(db, "userContainers", userId);
        const snapshot = await getDoc(userContainerRef);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const containers = [];

            // デフォルトコンテナがあれば優先的に追加
            if (data.defaultContainerId) {
                containers.push({
                    id: data.defaultContainerId,
                    name: "デフォルトコンテナ",
                    isDefault: true,
                });
            }

            // アクセス可能なコンテナIDリストがあれば追加
            if (data.accessibleContainerIds && data.accessibleContainerIds.length > 0) {
                // デフォルトコンテナと重複しないようにフィルタリング
                const additionalContainers = data.accessibleContainerIds
                    .filter(id => id !== data.defaultContainerId)
                    .map(id => ({
                        id,
                        name: `コンテナ ${id.substring(0, 8)}...`, // IDの一部を表示
                        isDefault: false,
                    }));

                containers.push(...additionalContainers);
            }

            return containers;
        }

        return [];
    }
    catch (error) {
        logger.error("コンテナリスト取得エラー:", error);
        return [];
    }
}

/**
 * コンテナIDをサーバー側に保存する
 * @param containerId 保存するコンテナID
 * @returns 保存に成功したかどうか
 */
export async function saveContainerIdToServer(containerId: string): Promise<boolean> {
    try {
        // テスト環境の場合は、直接 userContainer ストアに追加
        if (
            typeof window !== "undefined" &&
            (window.mockFluidClient === false ||
                import.meta.env.VITE_IS_TEST === "true" ||
                window.localStorage.getItem("VITE_USE_TINYLICIOUS") === "true")
        ) {
            logger.info("Test environment detected, saving container ID to mock store");

            // 既存のコンテナデータを取得
            const containerData = get(userContainer);

            // 新しいコンテナデータを作成または更新
            const updatedData = containerData ? {
                ...containerData,
                defaultContainerId: containerId,
                accessibleContainerIds: containerData.accessibleContainerIds
                    ? [...new Set([...containerData.accessibleContainerIds, containerId])]
                    : [containerId],
                updatedAt: new Date(),
            } : {
                userId: "test-user-id",
                defaultContainerId: containerId,
                accessibleContainerIds: [containerId],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // ストアを更新
            userContainer.set(updatedData);
            logger.info("Container ID saved to mock store:", updatedData);

            // ローカルストレージにも現在のコンテナIDを保存
            window.localStorage.setItem("currentContainerId", containerId);

            return true;
        }

        // 本番環境ではAPIを使用
        // ユーザーがログインしていることを確認
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot save container ID to server: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot save container ID to server: Firebase user not available");
            return false;
        }

        // サーバーAPIを呼び出してコンテナIDを保存
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:7071";
        const response = await fetch(`${apiBaseUrl}/api/save-container`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully saved container ID to server for user ${currentUser.id}`);
        return result.success === true;
    }
    catch (error) {
        logger.error("Error saving container ID to server:", error);
        return false;
    }
}

// アプリ起動時に自動的に初期化
if (typeof window !== "undefined") {
    let cleanup: (() => void) | null = null;

    // 認証状態が変更されたときに Firestore 同期を初期化/クリーンアップ
    const unsubscribeAuth = userManager.addEventListener(authResult => {
        // 前回のクリーンアップがあれば実行
        if (cleanup) {
            cleanup();
            cleanup = null;
        }

        // 認証されていればリスナーを設定
        if (authResult) {
            cleanup = initFirestoreSync();
        }
        else {
            // 未認証の場合はコンテナを空にする
            userContainer.set(null);
        }
    });

    // ページアンロード時のクリーンアップ
    window.addEventListener("beforeunload", () => {
        if (cleanup) {
            cleanup();
        }
        unsubscribeAuth();
    });
}
