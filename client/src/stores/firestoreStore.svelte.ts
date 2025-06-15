import {
    type FirebaseApp,
    initializeApp,
} from "firebase/app";
import {
    connectFirestoreEmulator,
    doc,
    Firestore,
    getDoc,
    getFirestore,
    onSnapshot,
} from "firebase/firestore";

import { userManager } from "../auth/UserManager";
import { getLogger } from "../lib/logger";
const logger = getLogger();
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
    accessibleContainers?: Array<{ id: string; role: 'owner' | 'editor' | 'viewer' }>;
    createdAt: Date;
    updatedAt: Date;
}

class GeneralStore {
    // ユーザーコンテナのストア
    userContainer: UserContainer | null = $state(null);
}
export const firestoreStore = new GeneralStore();

// Firestoreアプリとデータベースの初期化
let app: FirebaseApp | undefined;
let db: Firestore | undefined;

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
    db = getFirestore(app!);

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
        // 環境変数から接続情報を取得（デフォルトは192.168.50.13:58080）
        const emulatorHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || "192.168.50.13";
        const emulatorPort = parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "58080", 10);

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
                        accessibleContainers: data.accessibleContainers || [],
                        createdAt: data.createdAt?.toDate() || new Date(),
                        updatedAt: data.updatedAt?.toDate() || new Date(),
                    };

                    firestoreStore.userContainer = containerData;
                    logger.info(`ユーザー ${userId} のコンテナ情報を読み込みました`);
                    logger.info(`デフォルトコンテナID: ${containerData.defaultContainerId || "なし"}`);
                }
                else {
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
    }
    catch (error) {
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

        // Firebase Functionsのエンドポイントを取得
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        logger.info(`Saving container ID to Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナIDを保存
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

            // 新しいコンテナデータを作成または更新
            const newContainerEntry = { id: containerId, role: 'owner' as const };
            let updatedAccessibleContainers = firestoreStore.userContainer?.accessibleContainers ?
                [...firestoreStore.userContainer.accessibleContainers] : [];

            // Check if the containerId already exists in accessibleContainers
            const existingEntryIndex = updatedAccessibleContainers.findIndex(c => c.id === containerId);
            if (existingEntryIndex !== -1) {
                // If it exists, update its role to 'owner' if it's not already
                if (updatedAccessibleContainers[existingEntryIndex].role !== 'owner') {
                    updatedAccessibleContainers[existingEntryIndex] = { ...updatedAccessibleContainers[existingEntryIndex], role: 'owner' };
                }
            } else {
                // If it doesn't exist, add it
                updatedAccessibleContainers.push(newContainerEntry);
            }

            // Ensure no duplicates if logic somehow led to it (though findIndex should prevent it)
            // And ensure defaultContainerId is present as owner
            const uniqueAccessibleContainers = updatedAccessibleContainers.filter((c, index, self) =>
                index === self.findIndex((t) => t.id === c.id)
            );
            if (!uniqueAccessibleContainers.find(c => c.id === containerId && c.role === 'owner')) {
                 // This case should ideally not be hit if above logic is correct
                const idx = uniqueAccessibleContainers.findIndex(c=> c.id === containerId);
                if (idx !== -1) uniqueAccessibleContainers[idx].role = 'owner';
                else uniqueAccessibleContainers.push({id: containerId, role: 'owner'});
            }


            const updatedData = firestoreStore.userContainer ? {
                ...firestoreStore.userContainer,
                defaultContainerId: containerId,
                accessibleContainers: uniqueAccessibleContainers,
                updatedAt: new Date(),
            } : {
                userId: "test-user-id", // Make sure this is a string
                defaultContainerId: containerId,
                accessibleContainers: [newContainerEntry],
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
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        logger.info(`Saving container ID to Firebase Functions at ${apiBaseUrl}`);

        // Firebase Functionsを呼び出してコンテナIDを保存
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

/**
 * Shares a project with another user.
 * @param projectIdToShare The ID of the project/container to share.
 * @param targetUserEmail The email address of the user to share with.
 * @param roleToAssign The role to assign ('editor' or 'viewer').
 * @returns True if sharing was successful, false otherwise.
 */
export async function shareProject(
    projectIdToShare: string,
    targetUserEmail: string,
    roleToAssign: 'editor' | 'viewer'
): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot share project: User not logged in.");
            return false;
        }

        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot share project: Firebase user not available or ID token missing.");
            return false;
        }

        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        const response = await fetch(`${apiBaseUrl}/api/share-project`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                idToken,
                projectIdToShare,
                targetUserEmail,
                roleToAssign,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Error sharing project: ${response.status} ${errorText}`);
            // Consider parsing errorText if backend sends structured JSON errors
            return false;
        }

        const result = await response.json();
        if (result.success) {
            logger.info(`Project ${projectIdToShare} shared successfully with ${targetUserEmail} as ${roleToAssign}.`);
            // Firestore real-time updates should handle local state changes.
            // If immediate local update is needed, one might re-fetch or optimistically update.
            return true;
        } else {
            logger.error(`Failed to share project: ${result.error || 'Unknown error from server.'}`);
            return false;
        }
    } catch (error) {
        logger.error("Exception while sharing project:", error);
        return false;
    }
}

/**
 * Manages a member of a project (updates role or removes).
 * @param projectId The ID of the project/container.
 * @param targetUserId The Firebase UID of the user to manage.
 * @param action The action to perform: 'updateRole' or 'removeMember'.
 * @param newRole The new role to assign (required for 'updateRole').
 * @returns True if the action was successful, false otherwise.
 */
export async function manageProjectMember(
    projectId: string,
    targetUserId: string,
    action: 'updateRole' | 'removeMember',
    newRole?: 'editor' | 'viewer'
): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot manage project member: User not logged in.");
            return false;
        }

        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot manage project member: Firebase user not available or ID token missing.");
            return false;
        }

        if (action === 'updateRole' && !newRole) {
            logger.warn("manageProjectMember: 'newRole' is required for 'updateRole' action.");
            return false;
        }

        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        const requestBody: any = {
            idToken,
            projectId,
            targetUserId,
            action,
        };
        if (action === 'updateRole') {
            requestBody.newRole = newRole;
        }

        const response = await fetch(`${apiBaseUrl}/api/manage-project-members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Error managing project member: ${response.status} ${errorText}`);
            return false;
        }

        const result = await response.json();
        if (result.success) {
            logger.info(`Successfully performed action '${action}' for user ${targetUserId} in project ${projectId}.`);
            // Firestore real-time updates should handle local state changes.
            return true;
        } else {
            logger.error(`Failed to manage project member: ${result.error || 'Unknown error from server.'}`);
            return false;
        }
    } catch (error) {
        logger.error("Exception while managing project member:", error);
        return false;
    }
}

export interface ProjectMember {
    id: string;
    email?: string; // Email might be missing or failed to fetch for some users
    role: 'owner' | 'editor' | 'viewer';
    displayName?: string | null; // displayName can be null
}

/**
 * Fetches a list of members for a given project by calling the backend API.
 * @param projectId The ID of the project/container.
 * @returns A promise that resolves to an array of project members.
 */
export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("getProjectMembers: User not logged in.");
            return [];
        }
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("getProjectMembers: Could not retrieve idToken.");
            return [];
        }

        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57070";
        const response = await fetch(`${apiBaseUrl}/api/get-project-members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken, projectId }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`getProjectMembers: API error ${response.status}: ${errorText}`);
            return [];
        }

        const data = await response.json();
        // The backend is expected to return { members: Array<ProjectMember> }
        if (data.members && Array.isArray(data.members)) {
            logger.info(`Successfully fetched ${data.members.length} members for project ${projectId}`);
            return data.members as ProjectMember[];
        } else {
            logger.error("getProjectMembers: API response did not contain a valid members array.", data);
            return [];
        }
    } catch (error) {
        logger.error("getProjectMembers: Exception occurred.", error);
        return [];
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
