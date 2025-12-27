import { type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, doc, type Firestore, getDoc, getFirestore, onSnapshot } from "firebase/firestore";

import { userManager } from "../auth/UserManager";
import { getFirebaseApp } from "../lib/firebase-app";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";
import { getLogger } from "../lib/logger";
const logger = getLogger();

// ユーザーコンテナの型定義
export interface UserProject {
    userId: string;
    defaultProjectId: string | null;
    accessibleProjectIds: Array<string>;
    createdAt: Date;
    updatedAt: Date;
}

class GeneralStore {
    // 直接公開フィールド（$state が追跡可能なプロパティ）
    public userProject: UserProject | null = null;

    // $state 再計算トリガ（CustomEvent 不要のためのトップレベル依存）
    public ucVersion = 0;

    // 明示 API で wrap + 新参照を適用
    setUserProject(value: UserProject | null) {
        // $state が追跡する公開プロパティに直接代入
        const self = firestoreStore as any;
        const prevVersion = self.ucVersion ?? 0;
        const prevLength = self.userProject?.accessibleProjectIds?.length ?? 0;
        const prevDefault = self.userProject?.defaultProjectId;

        const nextProject = value ? self.wrapUserProject(value) : null;
        self.userProject = nextProject;

        // $state 依存を更新（CustomEvent に頼らない）
        self.ucVersion = prevVersion + 1;
        // 追加通知（テスト環境限定）: UI への橋渡しとして軽量な DOM イベントを発火
        try {
            const __isTestEnv = import.meta.env.MODE === "test"
                || process.env.NODE_ENV === "test"
                || import.meta.env.VITE_IS_TEST === "true";
            if (typeof window !== "undefined" && __isTestEnv) {
                window.dispatchEvent(new CustomEvent("firestore-uc-changed"));
            }
        } catch {}

        const nextLength = self.userProject?.accessibleProjectIds?.length ?? 0;
        const nextDefault = self.userProject?.defaultProjectId;

        if (typeof console !== "undefined" && typeof console.info === "function") {
            try {
                const payload = {
                    prev: {
                        ucVersion: prevVersion,
                        accessibleProjectIdsLength: prevLength,
                        defaultProjectId: prevDefault,
                    },
                    next: {
                        ucVersion: self.ucVersion,
                        accessibleProjectIdsLength: nextLength,
                        defaultProjectId: nextDefault,
                    },
                };
                console.info(
                    `[firestoreStore.setUserProject] prev.ucVersion=${payload.prev.ucVersion} prev.len=${payload.prev.accessibleProjectIdsLength} prev.default=${payload.prev.defaultProjectId} -> next.ucVersion=${payload.next.ucVersion} next.len=${payload.next.accessibleProjectIdsLength} next.default=${payload.next.defaultProjectId}`,
                );
            } catch {}
        }
    }

    // Array 変更（push/spliceなど）でも UI を更新させるための Proxy ラッパー
    public wrapUserProject(value: UserProject): UserProject {
        const arrayHandler: ProxyHandler<string[]> = {
            get: (target, prop, receiver) => {
                const v = Reflect.get(target, prop, receiver);
                // 破壊的メソッドをフック
                if (
                    typeof v === "function"
                    && ["push", "pop", "splice", "shift", "unshift", "sort", "reverse"].includes(String(prop))
                ) {
                    return (...args: any[]) => {
                        const res = (v as any).apply(target, args);
                        // 同一参照でも reactivity を起こすため再代入
                        try {
                            // 新しい配列を作って差し替える
                            const nextArr = Array.from(target);
                            const next: UserProject = { ...value, accessibleProjectIds: nextArr };
                            // Proxy 経由で確実に reactivity を発火させるため、公開プロキシに代入
                            (firestoreStore as any).setUserProject(next); // API 経由で ucVersion++ を確実に反映
                        } catch (e) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.warn({ err }, "Failed to trigger userProject update after array mutation");
                        }
                        return res;
                    };
                }
                return v;
            },
        };
        const proxiedIds = new Proxy(value.accessibleProjectIds ?? [], arrayHandler);
        return { ...value, accessibleProjectIds: proxiedIds } as UserProject;
    }

    reset() {
        const self = firestoreStore as any;
        self.userProject = null;
        self.ucVersion = 0;
    }

    constructor() {
        // コンストラクタは空にする
    }
}
// 2重ロード対策: 既存のグローバルがあればそれを使う
// Svelte 5 runes が利用可能な場合はそれを使用し、そうでない場合は通常のオブジェクトを使用
const __tmpStore = (typeof $state !== "undefined")
    ? $state(new GeneralStore())
    : new GeneralStore();
const existingCandidate = typeof window !== "undefined"
    ? (window as any).__FIRESTORE_STORE__
    : (globalThis as any).__FIRESTORE_STORE__;
const shouldReuseExisting = typeof existingCandidate === "object"
    && existingCandidate !== null
    && existingCandidate.__isRealFirestoreStore === true;
export const firestoreStore = (shouldReuseExisting ? existingCandidate : __tmpStore) as typeof __tmpStore;
(firestoreStore as any).__isRealFirestoreStore = true;

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
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error({ err: error }, "Failed to connect to Firestore emulator");

            // 接続できない場合はオフラインモードで続行することを通知
            logger.warn("Continuing in offline mode. Data operations will be cached until connection is restored.");
        }
    }
} catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, "Critical error initializing Firestore");
    // データベース接続に失敗した場合でもアプリが動作し続けられるように
    // appがundefinedの場合は何もしない（後続の処理で適切に処理される）
    if (!db && app) {
        db = getFirestore(app);
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
    logger.info(`ユーザー ${userId} の userProjects ドキュメントを監視します`);

    try {
        // ドキュメントへの参照を取得 (/userProjects/{userId})
        const userProjectRef = doc(db!, "userProjects", userId);

        // エラーハンドリングを強化したリアルタイム更新リスナー
        unsubscribe = onSnapshot(
            userProjectRef,
            snapshot => {
                if (snapshot.exists()) {
                    const data = snapshot.data();

                    const projectData: UserProject = {
                        userId: data.userId,
                        defaultProjectId: data.defaultProjectId,
                        accessibleProjectIds: data.accessibleProjectIds || [],
                        createdAt: data.createdAt?.toDate() || new Date(),
                        updatedAt: data.updatedAt?.toDate() || new Date(),
                    };

                    // E2E テストの安定化: すでにテストヘルパーにより userProject が投入されていて
                    // incoming が空配列の場合は上書きを抑止する（初期同期で空→即時消去されるのを避ける）
                    const isTestEnv = import.meta.env.MODE === "test"
                        || process.env.NODE_ENV === "test"
                        || import.meta.env.VITE_IS_TEST === "true";
                    const hasSeeded = !!(firestoreStore.userProject?.accessibleProjectIds?.length);
                    const incomingEmpty = !(projectData.accessibleProjectIds?.length);
                    if (isTestEnv && hasSeeded && incomingEmpty) {
                        logger.info(
                            "FirestoreStore: keeping seeded userProject; ignoring empty snapshot in test env",
                        );
                    } else {
                        firestoreStore.setUserProject(projectData);
                        logger.info(`ユーザー ${userId} のコンテナ情報を読み込みました`);
                        logger.info(`デフォルトコンテナID: ${projectData.defaultProjectId || "なし"}`);
                    }
                } else {
                    logger.info(`ユーザー ${userId} のコンテナ情報は存在しません`);
                }
            },
            error => {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error({ err }, "Firestoreのリスニングエラー");
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
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ err }, "Firestore監視設定エラー");
        return () => {}; // 空のクリーンアップ関数を返す
    }
}

// サーバーAPIを使ってコンテナIDを保存（更新はサーバーサイドでのみ行う）
export async function saveProjectId(projectId: string): Promise<boolean> {
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
        logger.info(`Saving project ID via /api/saveProject`);

        // Firebase Functionsを呼び出してコンテナIDを保存
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        const response = await fetch(`${apiBaseUrl}/api/save-project`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                projectId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.success === true;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ err }, "コンテナID保存エラー");
        return false;
    }
}

// デフォルトコンテナIDを取得
export async function getDefaultProjectId(): Promise<string | undefined> {
    try {
        // ユーザーがログインしていることを確認
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.info("Cannot get default project ID: User not logged in. Waiting for login...");
            return undefined;
        }

        // 1. まずストアから直接取得を試みる（リアルタイム更新されている場合）
        if (firestoreStore.userProject?.defaultProjectId) {
            logger.info(`Found default project ID in store: ${firestoreStore.userProject.defaultProjectId}`);
            return firestoreStore.userProject.defaultProjectId;
        }

        // 2. ストアに値がない場合は直接Firestoreから取得
        try {
            logger.info("No default project found in store, fetching from server...");
            const userId = currentUser.id;

            // Firestoreのimport確認
            if (!db) {
                logger.error("Firestore db is not initialized");
                return undefined;
            }

            const userProjectRef = doc(db, "userProjects", userId);
            const snapshot = await getDoc(userProjectRef);

            if (snapshot.exists()) {
                const data = snapshot.data();
                const projectId = data.defaultProjectId;
                if (projectId) {
                    logger.info(`Found default project ID from Firestore: ${projectId}`);
                    return projectId;
                }
            }
        } catch (firestoreError) {
            const err = firestoreError instanceof Error ? firestoreError : new Error(String(firestoreError));
            logger.error({ err }, "Firestore access error");
            // Firestoreエラーは致命的ではないので、続行
        }

        logger.info("No default project ID found");
        return undefined;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ err }, "デフォルトコンテナID取得エラー");
        return undefined;
    }
}

// Aliases for backwards compatibility during containers -> projects migration
export const getDefaultContainerId = getDefaultProjectId;
export const saveContainerId = saveProjectId;

/**
 * コンテナIDをサーバー側に保存する
 * @param projectId 保存するコンテナID
 * @returns 保存に成功したかどうか
 */
export async function saveProjectIdToServer(projectId: string): Promise<boolean> {
    try {
        // テスト環境の場合は、直接 userProject ストアに追加
        if (
            typeof window !== "undefined"
            && (window.mockFluidClient === false
                || import.meta.env.VITE_IS_TEST === "true"
                || window.localStorage.getItem("VITE_USE_TINYLICIOUS") === "true")
        ) {
            logger.info("Test environment detected, saving project ID to mock store");

            // 新しいコンテナデータを作成または更新
            const updatedData = firestoreStore.userProject
                ? {
                    ...firestoreStore.userProject,
                    defaultProjectId: projectId,
                    accessibleProjectIds: firestoreStore.userProject.accessibleProjectIds
                        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary Set for deduplication, not reactive state
                        ? [...new Set([...firestoreStore.userProject.accessibleProjectIds, projectId])]
                        : [projectId],
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    updatedAt: new Date(),
                }
                : {
                    userId: "test-user-id",
                    defaultProjectId: projectId,
                    accessibleProjectIds: [projectId],
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    createdAt: new Date(),
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    updatedAt: new Date(),
                };

            // ストアを更新
            firestoreStore.setUserProject(updatedData);
            logger.info({ updatedData }, "Project ID saved to mock store");

            // ローカルストレージにも現在のコンテナIDを保存
            window.localStorage.setItem("currentProjectId", projectId);

            return true;
        }

        // 本番環境ではAPIを使用
        // ユーザーがログインしていることを確認
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot save project ID to server: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot save project ID to server: Firebase user not available");
            return false;
        }

        // Firebase Functionsのエンドポイントを取得
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        logger.info(`Saving project ID to Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナIDを保存
        const response = await fetch(getFirebaseFunctionUrl("saveProject"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                projectId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully saved project ID to server for user ${currentUser.id}`);
        return result.success === true;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error({ err }, "Error saving project ID to server");
        return false;
    }
}

// Alias for backwards compatibility during containers -> projects migration
export const saveContainerIdToServer = saveProjectIdToServer;

// UserContainer type alias for backward compatibility
export type UserContainer = UserProject;

// Getter alias to access userProject as userContainer
Object.defineProperty(firestoreStore, "userContainer", {
    get() {
        return (firestoreStore as any).userProject;
    },
    enumerable: true,
    configurable: true,
});

// Method alias for setUserContainer -> setUserProject
(firestoreStore as any).setUserContainer = function(value: UserProject | null) {
    return (firestoreStore as any).setUserProject(value);
};

// アプリ起動時に自動的に初期化
if (typeof window !== "undefined") {
    const __isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true";

    if (!__isTestEnv) {
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
                firestoreStore.setUserProject(null);
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
}
