import { type FirebaseApp } from "firebase/app";
import {
    type Auth,
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    type User as FirebaseUser,
} from "firebase/auth";
import { getEnv } from "../lib/env";
import { getFirebaseApp } from "../lib/firebase-app";
import { getLogger } from "../lib/logger"; // log関数をインポート

const logger = getLogger() as any;

// ユーザー情報の型定義
export interface IUser {
    id: string;
    name: string;
    email?: string;
    photoURL?: string;
    providerIds?: string[];
}

// 認証結果の型定義
export interface IAuthResult {
    user: IUser;
}

// 認証イベントリスナーの型定義
type AuthEventListener = (result: IAuthResult | null) => void;

export class UserManager {
    // Firebase 設定
    private firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };

    private apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57000");
    private _app: FirebaseApp | null = null;
    private _auth: Auth | null = null;

    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;

    // 開発環境かどうかの判定
    private isDevelopment = import.meta.env.DEV || import.meta.env.MODE === "development"
        || process.env.NODE_ENV === "development";

    /**
     * Firebaseアプリインスタンスを遅延初期化で取得
     * SSR環境での重複初期化を防ぐ
     */
    private get app(): FirebaseApp {
        if (!this._app) {
            this._app = getFirebaseApp();
        }
        return this._app;
    }

    /**
     * Firebase Authインスタンスを遅延初期化で取得
     */
    get auth(): Auth {
        if (!this._auth) {
            this._auth = getAuth(this.app);
        }
        return this._auth;
    }

    /**
     * API Base URLを取得
     */
    get functionsUrl(): string {
        return this.apiBaseUrl;
    }

    constructor() {
        logger.debug("Initializing...");

        // テスト環境でのアクセスのためにグローバルに設定
        if (typeof window !== "undefined") {
            (window as unknown as { __USER_MANAGER__: UserManager; }).__USER_MANAGER__ = this;
        }

        // 認証リスナーを非同期で初期化
        this.initAuthListenerAsync();

        // テスト環境の検出
        const isTestEnv = import.meta.env.MODE === "test"
            || process.env.NODE_ENV === "test"
            || import.meta.env.VITE_IS_TEST === "true";

        // プロダクション環境では絶対にエミュレータを使用しない
        const isProduction = process.env.NODE_ENV === "production"
            || import.meta.env.MODE === "production";

        const useEmulator = !isProduction && (
            isTestEnv
            || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true")
        );

        // サーバーサイドレンダリング環境かどうかを判定
        const isSSR = typeof window === "undefined";

        // Firebase Auth Emulatorに接続
        if (useEmulator) {
            logger.info("Connecting to Auth emulator");
            try {
                const connected = this.connectToFirebaseEmulator();
                if (connected) {
                    logger.info("Successfully connected to Auth emulator");
                    // テスト環境では自動的にテストユーザーでログイン
                    this._setupMockUser();
                } else {
                    // エミュレーター接続に失敗した場合
                    const error = new Error("Failed to connect to Firebase Auth emulator");
                    logger.error({ error }, "Failed to connect to Auth emulator, authentication may not work");

                    // SSR環境ではエラーをスローしない（クライアント側でリトライできるように）
                    if (!isSSR) {
                        throw error;
                    } else {
                        logger.info("Running in SSR environment, will retry connection on client side");
                    }
                }
            } catch (err) {
                // エミュレーターに接続できない場合
                logger.error({ error: err }, "Failed to connect to Auth emulator");

                // SSR環境ではエラーをスローしない
                if (!isSSR) {
                    throw err;
                } else {
                    logger.info("Running in SSR environment, will retry connection on client side");
                }
            }
        }
    }

    // Firebase Auth Emulatorに接続
    private connectToFirebaseEmulator(): boolean {
        try {
            // 環境変数から接続情報を取得（デフォルトはlocalhost:59099）
            const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "localhost";
            const port = parseInt(import.meta.env.VITE_AUTH_EMULATOR_PORT || "59099", 10);

            logger.info(`Connecting to Firebase Auth emulator at ${host}:${port}`);
            connectAuthEmulator(this.auth, `http://${host}:${port}`, { disableWarnings: true });
            logger.info(`Successfully connected to Firebase Auth emulator at ${host}:${port}`);
            return true;
        } catch (err) {
            logger.error({ error: err }, "Error connecting to Firebase Auth emulator");
            return false;
        }
    }

    // テスト環境用のユーザーをセットアップ
    private async _setupMockUser() {
        // テスト環境の検出条件を拡張
        const isTestEnvironment = typeof window !== "undefined" && (
            window.location.href.includes("e2e-test")
            || import.meta.env.VITE_IS_TEST === "true"
            || localStorage.getItem("VITE_IS_TEST") === "true"
            || process.env.NODE_ENV === "test"
        );

        // E2Eテスト用にFirebaseメール/パスワード認証を使う
        if (isTestEnvironment) {
            logger.info("[UserManager] E2E test environment detected, using Firebase auth emulator with test account");
            logger.info("[UserManager] Attempting E2E test login with test@example.com");

            // テストユーザーでログイン
            try {
                await signInWithEmailAndPassword(this.auth, "test@example.com", "password");
                logger.info("[UserManager] Test user login successful");
            } catch (error) {
                logger.error({ error }, "[UserManager] Test user login failed");

                // ユーザーが存在しない場合は作成を試みる
                try {
                    logger.info("[UserManager] Attempting to create test user");
                    await createUserWithEmailAndPassword(this.auth, "test@example.com", "password");
                    logger.info("[UserManager] Test user created and logged in successfully");
                } catch (createError) {
                    logger.error({ error: createError }, "[UserManager] Failed to create test user");
                }
            }
            return;
        }

        // エミュレータを使用して認証
        logger.info("[UserManager] Using Firebase auth emulator for testing");
    }

    // Firebase認証状態の監視（非同期初期化）
    private async initAuthListenerAsync(): Promise<void> {
        try {
            // Firebase appとauthの初期化を確実に行う
            const auth = this.auth;
            logger.debug("Firebase Auth initialized, setting up listener");

            this.unsubscribeAuth = onAuthStateChanged(auth, async firebaseUser => {
                logger.debug("onAuthStateChanged triggered", {
                    hasUser: !!firebaseUser,
                    userId: firebaseUser?.uid,
                    email: firebaseUser?.email,
                });

                if (firebaseUser) {
                    logger.info("User signed in via onAuthStateChanged", { userId: firebaseUser.uid });
                    await this.handleUserSignedIn(firebaseUser);
                } else {
                    logger.info("User signed out via onAuthStateChanged");
                    this.handleUserSignedOut();
                }
            });
        } catch (error) {
            logger.error({ error }, "Failed to initialize auth listener");
            // エラーが発生した場合は少し待ってからリトライ
            setTimeout(() => {
                this.initAuthListenerAsync();
            }, 1000);
        }
    }

    // Firebase認証状態の監視（同期版 - 後方互換性のため）
    private initAuthListener(): void {
        this.initAuthListenerAsync();
    }

    // ユーザーサインイン処理
    private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
        try {
            logger.debug("handleUserSignedIn started", { uid: firebaseUser.uid });

            // ユーザーオブジェクトを作成
            const providerIds = firebaseUser.providerData
                .map(info => info?.providerId)
                .filter((id): id is string => !!id);
            if (providerIds.length === 0 && firebaseUser.providerId) {
                providerIds.push(firebaseUser.providerId);
            }

            const user: IUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || "Anonymous User",
                email: firebaseUser.email || undefined,
                photoURL: firebaseUser.photoURL || undefined,
                providerIds: providerIds.length > 0 ? providerIds : undefined,
            };

            logger.info("Notifying listeners of successful authentication", {
                userId: user.id,
                listenerCount: this.listeners.length,
            });

            // 認証結果をリスナーに通知
            this.notifyListeners({
                user,
            });

            logger.debug("handleUserSignedIn completed successfully");
        } catch (error) {
            logger.error({ error }, "Error handling user sign in");
            // エラーが発生した場合は認証失敗として扱う
            this.notifyListeners(null);
        }
    }

    // ユーザーサインアウト処理
    private handleUserSignedOut(): void {
        logger.debug("User signed out");
        this.notifyListeners(null);
    }

    // ユーザー情報を取得する関数
    public getCurrentUser(): IUser | null {
        const firebaseUser = this.auth.currentUser;
        if (!firebaseUser) return null;

        const providerIds = firebaseUser.providerData
            .map(info => info?.providerId)
            .filter((id): id is string => !!id);
        if (providerIds.length === 0 && firebaseUser.providerId) {
            providerIds.push(firebaseUser.providerId);
        }

        return {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || "Anonymous User",
            email: firebaseUser.email || undefined,
            photoURL: firebaseUser.photoURL || undefined,
            providerIds: providerIds.length > 0 ? providerIds : undefined,
        };
    }

    // Googleでログイン
    public async loginWithGoogle(): Promise<void> {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(this.auth, provider);
            // 認証状態の変更はonAuthStateChangedで検知される
        } catch (error) {
            logger.error({ error }, "[UserManager] Google login error");
            throw error;
        }
    }

    // メールアドレスとパスワードでログイン（開発環境用）
    public async loginWithEmailPassword(email: string, password: string): Promise<void> {
        try {
            logger.info(`[UserManager] Attempting email/password login for: ${email}`);
            logger.debug(
                `[UserManager] Current auth state: ${this.auth.currentUser ? "authenticated" : "not authenticated"}`,
            );

            // 開発環境の場合
            if (this.isDevelopment) {
                try {
                    // まず通常のFirebase認証を試みる
                    logger.debug("[UserManager] Calling signInWithEmailAndPassword");
                    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
                    logger.info("[UserManager] Email/password login successful via Firebase Auth", {
                        userId: userCredential.user.uid,
                    });
                    return;
                } catch (firebaseError) {
                    const errorObj = firebaseError as { message?: string; code?: string; };
                    logger.warn("[UserManager] Firebase Auth login failed:", errorObj.message);

                    // ユーザーが存在しない場合は作成を試みる
                    if (errorObj.code === "auth/user-not-found") {
                        try {
                            logger.info("[UserManager] User not found, attempting to create user");
                            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
                            logger.info("[UserManager] New user created and logged in successfully", {
                                userId: userCredential.user.uid,
                            });
                            return;
                        } catch (createError) {
                            logger.error({ error: createError }, "[UserManager] Failed to create new user");
                        }
                    }
                    // すべての方法が失敗した場合は元のエラーをスロー
                    throw firebaseError;
                }
            } else {
                // 本番環境では通常のFirebase認証のみを使用
                logger.debug("[UserManager] Production environment, using Firebase Auth only");
                await signInWithEmailAndPassword(this.auth, email, password);
            }
        } catch (error) {
            logger.error({ error }, "[UserManager] Email/password login error");
            throw error;
        }
    }

    // ログアウト
    public async logout(): Promise<void> {
        try {
            await signOut(this.auth);
            // ログアウト処理はonAuthStateChangedで検知される
        } catch (error) {
            logger.error({ error }, "[UserManager] Logout error");
            throw error;
        }
    }

    // 認証イベントのリスナーを追加
    public addEventListener(listener: AuthEventListener): () => void {
        this.listeners.push(listener);

        // 既に認証済みの場合は即座に通知（FluidTokenは不要）
        if (this.auth.currentUser) {
            const user = this.getCurrentUser();
            if (user) {
                logger.debug("addEventListener: User already authenticated, notifying immediately", {
                    userId: user.id,
                });
                listener({
                    user,
                });
            }
        }

        // リスナー削除用の関数を返す
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    // リスナーに認証状態の変更を通知
    private notifyListeners(authResult: IAuthResult | null): void {
        for (const listener of this.listeners) {
            listener(authResult);
        }
    }

    // 手動でリスナーに通知（デバッグ用）
    public manualNotifyListeners(authResult: IAuthResult | null): void {
        this.notifyListeners(authResult);
    }

    // Firebaseに認証済みかどうかを確認
    public isAuthenticated(): boolean {
        return !!this.auth.currentUser;
    }

    // クリーンアップ
    public dispose(): void {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        this.listeners = [];
    }

    // テストおよび開発用: 明示的にIDトークンを更新し、リスナーへ通知
    public async refreshToken(): Promise<void> {
        try {
            const current = this.auth.currentUser;
            if (!current) {
                logger.warn("[UserManager] refreshToken called without currentUser");
                return;
            }
            // force refresh
            await current.getIdToken(true);
            const user = this.getCurrentUser();
            if (user) {
                // 通知により attachTokenRefresh 経由でプロバイダの auth パラメータが更新される
                this.notifyListeners({ user });
            }
        } catch (err) {
            logger.error({ error: err }, "[UserManager] refreshToken failed");
        }
    }
}

export const userManager = new UserManager();

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        (window as unknown as { __USER_MANAGER__: UserManager; }).__USER_MANAGER__ = userManager;
    }
}
