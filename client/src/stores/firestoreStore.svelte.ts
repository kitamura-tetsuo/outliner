import { type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, doc, type Firestore, getDoc, getFirestore, onSnapshot } from "firebase/firestore";

import { userManager } from "../auth/UserManager";
import { getFirebaseApp } from "../lib/firebase-app";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";
import { getLogger } from "../lib/logger";
const logger = getLogger();

// ユーザーコンテナの型定義
export interface UserContainer {
    userId: string;
    defaultContainerId?: string;
    accessibleContainerIds?: string[];
    createdAt: Date;
    updatedAt: Date;
}

class GeneralStore {
    // ユーザーコンテナのストア
    private _userContainer: UserContainer | null = $state(null);

    get userContainer(): UserContainer | null {
        return this._userContainer;
    }

    set userContainer(value: UserContainer | null) {
        this._userContainer = value;
        // デバッグ情報をログ出力
        logger.info("FirestoreStore - userContainer:", value);
        if (value) {
            logger.info("FirestoreStore - accessibleContainerIds:", value.accessibleContainerIds);
            logger.info("FirestoreStore - defaultContainerId:", value.defaultContainerId);
        }
    }

    constructor() {
        // コンストラクタは空にする
    }
}
export const firestoreStore = new GeneralStore();

// テスト環境ではグローバルに公開してE2Eから制御できるようにする
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost";
    if (isTestEnv) {
        (window as any).__FIRESTORE_STORE__ = firestoreStore;
    }
}

// Firestoreアプリとデータベースの初期化
let app: FirebaseApp | undefined;
let db: Firestore | undefined;

// Firebaseアプリの初期化（一度だけ）
try {
    // 中央管理されたFirebaseアプリを使用
    app = getFirebaseApp();
    logger.info("Firebase app initialized via central management");

    // Firestoreインスタンスの取得
    db = getFirestore(app!);

    // テスト環境またはエミュレータ環境を検出して接続
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.mockFluidClient === false);

    // プロダクション環境では絶対にエミュレータを使用しない
    const isProduction = process.env.NODE_ENV === "production"
        || import.meta.env.MODE === "production";

    const useEmulator = !isProduction && (
        isTestEnv
        || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true"
        || (typeof window !== "undefined"
            && window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true")
    );

    // Firebase Emulatorに接続
    if (useEmulator) {
        // 環境変数から接続情報を取得（デフォルトはlocalhost:58080）
        const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "localhost";
        const emulatorPort = parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "58080", 10);

        // エミュレーター接続情報をログに出力
        logger.info(`Connecting to Firestore emulator at ${emulatorHost}:${emulatorPort}`);

        try {
            // エミュレーターに接続
            connectFirestoreEmulator(db, emulatorHost, emulatorPort);
            logger.info("Successfully connected to Firestore emulator");
        } catch (err) {
            logger.error("Failed to connect to Firestore emulator:", err);

            // 接続できない場合はオフラインモードで続行することを通知
            logger.warn("Continuing in offline mode. Data operations will be cached until connection is restored.");
        }
    }
} catch (error) {
    logger.error("Critical error initializing Firestore:", error);
    // データベース接続に失敗した場合でもアプリが動作し続けられるように
    // 最低限の初期化だけを行う
    if (!db) {
        db = getFirestore(app!);
    }
}

// リスナーの解除関数
let unsubscribe: (() => void) | null = null;

// Firestoreとの同期を開始する関数
function initFirestoreSync(): () => void {
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
        const userContainerRef = doc(db!, "userContainers", userId);

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

                    firestoreStore.userContainer = containerData;
                    logger.info(`ユーザー ${userId} のコンテナ情報を読み込みました`);
                    logger.info(`デフォルトコンテナID: ${containerData.defaultContainerId || "なし"}`);
                } else {
                    logger.info(`ユーザー ${userId} のコンテナ情報は存在しません`);
                }
            },
            error => {
                logger.error("Firestoreのリスニングエラー:", error);
            },
        );

        // クリーンアップ関数を返す
        return () => {
            if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
            }
        };
    } catch (error) {
        logger.error("Firestore監視設定エラー:", error);
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

        // /api/プレフィックスを付加してhost経由で呼び出し
        logger.info(`Saving container ID via /api/saveContainer`);

        // Firebase Functionsを呼び出してコンテナIDを保存
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
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
    } catch (error) {
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
        if (firestoreStore.userContainer?.defaultContainerId) {
            logger.info(`Found default container ID in store: ${firestoreStore.userContainer.defaultContainerId}`);
            return firestoreStore.userContainer.defaultContainerId;
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
        } catch (firestoreError) {
            logger.error("Firestore access error:", firestoreError);
            // Firestoreエラーは致命的ではないので、続行
        }

        logger.info("No default container ID found");
        return undefined;
    } catch (error) {
        logger.error("デフォルトコンテナID取得エラー:", error);
        return undefined;
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
            typeof window !== "undefined"
            && (window.mockFluidClient === false
                || import.meta.env.VITE_IS_TEST === "true"
                || window.localStorage.getItem("VITE_USE_TINYLICIOUS") === "true")
        ) {
            logger.info("Test environment detected, saving container ID to mock store");

            // 新しいコンテナデータを作成または更新
            const updatedData = firestoreStore.userContainer
                ? {
                    ...firestoreStore.userContainer,
                    defaultContainerId: containerId,
                    accessibleContainerIds: firestoreStore.userContainer.accessibleContainerIds
                        ? [...new Set([...firestoreStore.userContainer.accessibleContainerIds, containerId])]
                        : [containerId],
                    updatedAt: new Date(),
                }
                : {
                    userId: "test-user-id",
                    defaultContainerId: containerId,
                    accessibleContainerIds: [containerId],
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

            // ストアを更新
            firestoreStore.userContainer = updatedData;
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

        // Firebase Functionsのエンドポイントを取得
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        logger.info(`Saving container ID to Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナIDを保存
        const response = await fetch(getFirebaseFunctionUrl("saveContainer"), {
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
    } catch (error) {
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
        } else {
            // 未認証の場合はuserContainerを空にする
            firestoreStore.userContainer = null;
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
