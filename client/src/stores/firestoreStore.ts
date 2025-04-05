import { get, writable, type Writable } from 'svelte/store';
import { getFirestore, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { UserManager } from '../auth/UserManager';

// Firebaseの設定情報はUserManagerから取得
const userManager = UserManager.getInstance();
const firebaseConfig = {
    apiKey: "AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
    authDomain: "outliner-d57b0.firebaseapp.com",
    projectId: "outliner-d57b0",
    storageBucket: "outliner-d57b0.firebasestorage.app",
    messagingSenderId: "560407608873",
    appId: "1:560407608873:web:147817f4a93a4678606638",
    measurementId: "G-FKSFRCT7GR"
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

// Firestoreアプリの初期化
let app;
try {
    // Firebase がすでに初期化されている場合のエラーを回避
    app = initializeApp(firebaseConfig);
} catch (e) {
    // すでに初期化されている場合は既存のアプリを使用
    console.log('Firebase app already initialized, reusing existing instance');
}

// Firestoreインスタンスの取得
const db = getFirestore(app);

// リスナーの解除関数
let unsubscribe: (() => void) | null = null;

// Firestoreとの同期を開始する関数
export function initFirestoreSync(): () => void {
    // 以前のリスナーがあれば解除
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    const currentUser = userManager.getCurrentUser()!;
    const userId = currentUser.id;
    console.log(`ユーザー ${userId} の userContainers ドキュメントを監視します`);

    // ドキュメントへの参照を取得 (/userContainers/{userId})
    const userContainerRef = doc(db, 'userContainers', userId);

    // リアルタイム更新をリッスン
    unsubscribe = onSnapshot(userContainerRef, (snapshot) => {
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
            console.log(`ユーザー ${userId} のコンテナ情報を読み込みました`);
            console.log(`デフォルトコンテナID: ${containerData.defaultContainerId || 'なし'}`);
        } else {
            console.log(`ユーザー ${userId} のコンテナ情報は存在しません`);
            userContainer.set(null);
        }
    }, (error) => {
        console.error('Firestoreのリスニングエラー:', error);
        userContainer.set(null);
    });

    // クリーンアップ関数を返す
    return () => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    };
}

// サーバーAPIを使ってコンテナIDを保存（更新はサーバーサイドでのみ行う）
export async function saveContainerId(containerId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            throw new Error('ユーザーがログインしていません');
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            throw new Error('認証トークンを取得できません');
        }

        // サーバーAPIを呼び出してコンテナIDを保存
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071';
        const response = await fetch(`${apiBaseUrl}/api/save-container`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                idToken,
                containerId
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result.success === true;
    } catch (error) {
        console.error('コンテナID保存エラー:', error);
        return false;
    }
}

// デフォルトコンテナIDを取得
export async function getDefaultContainerId(): Promise<string | null> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            console.warn('getDefaultContainerId: ユーザーがログインしていません');
            return null;
        }

        // 1. Svelte の get() 関数を使ってストアから直接取得
        const containerData = get(userContainer);
        if (containerData?.defaultContainerId) {
            return containerData.defaultContainerId;
        }

        // 2. ストアに値がない場合は直接Firestoreから取得
        const userId = currentUser.id;
        const userContainerRef = doc(db, 'userContainers', userId);
        const snapshot = await getDoc(userContainerRef);

        if (snapshot.exists()) {
            const data = snapshot.data();
            return data.defaultContainerId || null;
        }

        return null;
    } catch (error) {
        console.error('デフォルトコンテナID取得エラー:', error);
        return null;
    }
}

// ユーザーのコンテナリストを取得
export async function getUserContainers(): Promise<{ id: string, name?: string }[]> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            console.warn('getUserContainers: ユーザーがログインしていません');
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
                    name: 'デフォルトコンテナ',
                    isDefault: true
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
                        isDefault: false
                    }));

                containers.push(...additionalContainers);
            }

            return containers;
        }

        // ストアに値がない場合は直接Firestoreから取得
        const userId = currentUser.id;
        const userContainerRef = doc(db, 'userContainers', userId);
        const snapshot = await getDoc(userContainerRef);

        if (snapshot.exists()) {
            const data = snapshot.data();
            const containers = [];

            // デフォルトコンテナがあれば優先的に追加
            if (data.defaultContainerId) {
                containers.push({
                    id: data.defaultContainerId,
                    name: 'デフォルトコンテナ',
                    isDefault: true
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
                        isDefault: false
                    }));

                containers.push(...additionalContainers);
            }

            return containers;
        }

        return [];
    } catch (error) {
        console.error('コンテナリスト取得エラー:', error);
        return [];
    }
}

// アプリ起動時に自動的に初期化
if (typeof window !== 'undefined') {
    let cleanup: (() => void) | null = null;

    // 認証状態が変更されたときに Firestore 同期を初期化/クリーンアップ
    const unsubscribeAuth = userManager.addEventListener((authResult) => {
        // 前回のクリーンアップがあれば実行
        if (cleanup) {
            cleanup();
            cleanup = null;
        }

        // 認証されていればリスナーを設定
        if (authResult) {
            cleanup = initFirestoreSync();
        } else {
            // 未認証の場合はコンテナを空にする
            userContainer.set(null);
        }
    });

    // ページアンロード時のクリーンアップ
    window.addEventListener('beforeunload', () => {
        if (cleanup) {
            cleanup();
        }
        unsubscribeAuth();
    });
}