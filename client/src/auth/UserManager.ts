import { initializeApp } from "firebase/app";
import {
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
import { getLogger } from "../lib/logger"; // log関数をインポート

const logger = getLogger();

// ユーザー情報の型定義
export interface IUser {
    id: string;
    name: string;
    email?: string;
    photoURL?: string;
}

// Fluid Relayトークンの型定義
interface IFluidToken {
    token: string;
    user: {
        id: string;
        name: string;
    };
    tenantId?: string; // サーバーから受け取ったテナントIDを格納できるように追加
    containerId?: string; // 対象コンテナID
}

// 認証結果の型定義
interface IAuthResult {
    user: IUser;
}

// 認証イベントリスナーの型定義
type AuthEventListener = (result: IAuthResult | null) => void;

export class UserManager {
    // Firebase 設定
    private firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "outliner-d57b0.firebaseapp.com",
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0",
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "outliner-d57b0.firebasestorage.app",
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "560407608873",
        appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:560407608873:web:147817f4a93a4678606638",
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-FKSFRCT7GR",
    };

    private apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57070");
    private app = initializeApp(this.firebaseConfig);
    auth = getAuth(this.app);

    private currentFluidToken: IFluidToken | null = null;
    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;
    private isRefreshingToken = false; // トークン更新中フラグ
    private tokenRefreshPromise: Promise<IFluidToken | null> | null = null;
    private readonly TOKEN_REFRESH_TIMEOUT = 10000; // 10秒のタイムアウト

    // 開発環境かどうかの判定
    private isDevelopment = import.meta.env.DEV || import.meta.env.MODE === "development" ||
        process.env.NODE_ENV === "development";

    constructor() {
        logger.debug("Initializing...");

        this.initAuthListener();

        // テスト環境の検出
        const isTestEnv = import.meta.env.MODE === "test" ||
            process.env.NODE_ENV === "test" ||
            import.meta.env.VITE_IS_TEST === "true";

        const useEmulator = isTestEnv ||
            import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" ||
            (typeof window !== "undefined" && window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true");

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
                }
                else {
                    // エミュレーター接続に失敗した場合
                    const error = new Error("Failed to connect to Firebase Auth emulator");
                    logger.error("Failed to connect to Auth emulator, authentication may not work", error);

                    // SSR環境ではエラーをスローしない（クライアント側でリトライできるように）
                    if (!isSSR) {
                        throw error;
                    }
                    else {
                        logger.info("Running in SSR environment, will retry connection on client side");
                    }
                }
            }
            catch (err) {
                // エミュレーターに接続できない場合
                logger.error("Failed to connect to Auth emulator:", err);

                // SSR環境ではエラーをスローしない
                if (!isSSR) {
                    throw err;
                }
                else {
                    logger.info("Running in SSR environment, will retry connection on client side");
                }
            }
        }
        else {
            this.loadSavedUser();
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
        }
        catch (err) {
            logger.error("Error connecting to Firebase Auth emulator:", err);
            return false;
        }
    }

    // テスト環境用のユーザーをセットアップ
    private async _setupMockUser() {
        // E2Eテスト用にFirebaseメール/パスワード認証を使う
        if (
            typeof window !== "undefined" &&
            (window.location.href.includes("e2e-test") || import.meta.env.VITE_IS_TEST === "true")
        ) {
            logger.info("[UserManager] E2E test environment detected, using Firebase auth emulator with test account");
            logger.info("[UserManager] Attempting E2E test login with test@example.com");

            // テストユーザーでログイン
            try {
                await signInWithEmailAndPassword(this.auth, "test@example.com", "password");
                logger.info("[UserManager] Test user login successful");
            }
            catch (error) {
                logger.error("[UserManager] Test user login failed:", error);
            }
            return;
        }

        // エミュレータを使用して認証
        logger.info("[UserManager] Using Firebase auth emulator for testing");
    }

    // Firebase認証状態の監視
    private initAuthListener(): void {
        this.unsubscribeAuth = onAuthStateChanged(this.auth, async firebaseUser => {
            if (firebaseUser) {
                await this.handleUserSignedIn(firebaseUser);
            }
            else {
                this.handleUserSignedOut();
            }
        });
    }

    // ユーザーサインイン処理
    private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
        try {
            logger.debug("User signed in", { uid: firebaseUser.uid });

            // ユーザーオブジェクトを作成
            const user: IUser = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || "Anonymous User",
                email: firebaseUser.email || undefined,
                photoURL: firebaseUser.photoURL || undefined,
            };

            // 認証結果をリスナーに通知
            this.notifyListeners({
                user,
            });
        }
        catch (error) {
            logger.error("Error handling user sign in:", error);
            // エラーが発生した場合は認証失敗として扱う
            this.notifyListeners(null);
        }
    }

    // ユーザーサインアウト処理
    private handleUserSignedOut(): void {
        logger.debug("User signed out");
        this.currentFluidToken = null;

        // ブラウザ環境でのみlocalStorageを使用
        if (typeof window !== "undefined") {
            localStorage.removeItem("fluidUser"); // 不要になる可能性あり
        }

        this.notifyListeners(null);
    }

    // ユーザー情報を取得する関数
    public getCurrentUser(): IUser | null {
        const firebaseUser = this.auth.currentUser;
        if (!firebaseUser) return null;

        return {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || "Anonymous User",
            email: firebaseUser.email || undefined,
            photoURL: firebaseUser.photoURL || undefined,
        };
    }

    // Fluid Relayトークンを取得
    private async getFluidToken(idToken: string, containerId?: string): Promise<IFluidToken> {
        try {
            logger.info(`[UserManager] Requesting Fluid token from: ${this.apiBaseUrl}/api/fluid-token`);

            // リクエストボディの作成
            const requestBody: any = { idToken };

            // コンテナIDが指定されている場合は追加
            if (containerId) {
                requestBody.containerId = containerId;
                logger.info(`[UserManager] Requesting token for container: ${containerId}`);
            }

            // フェッチオプションを明示的に設定
            const response = await fetch(`${this.apiBaseUrl}/api/fluid-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                mode: "cors",
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`[UserManager] Fluid token request failed: ${response.status}`, errorText);
                throw new Error(`Fluid token request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            logger.info("[UserManager] Fluid token received successfully");
            return data;
        }
        catch (error) {
            logger.error("[UserManager] Error getting fluid token:", error);
            throw error;
        }
    }

    // 保存されたユーザー情報を読み込む
    public loadSavedUser(): IUser | null {
        if (typeof window !== "undefined") {
            const savedUser = localStorage.getItem("fluidUser");
            if (savedUser) {
                try {
                    return JSON.parse(savedUser);
                }
                catch (e) {
                    logger.error("[UserManager] Error parsing saved user:", e);
                    localStorage.removeItem("fluidUser");
                }
            }
        }
        return null;
    }

    // Googleでログイン
    public async loginWithGoogle(): Promise<void> {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(this.auth, provider);
            // 認証状態の変更はonAuthStateChangedで検知される
        }
        catch (error) {
            logger.error("[UserManager] Google login error:", error);
            throw error;
        }
    }

    // メールアドレスとパスワードでログイン（開発環境用）
    public async loginWithEmailPassword(email: string, password: string): Promise<void> {
        try {
            logger.info(`[UserManager] Attempting email/password login for: ${email}`);

            // 開発環境の場合
            if (this.isDevelopment) {
                try {
                    // まず通常のFirebase認証を試みる
                    await signInWithEmailAndPassword(this.auth, email, password);
                    logger.info("[UserManager] Email/password login successful via Firebase Auth");
                    return;
                }
                catch (firebaseError: any) {
                    logger.warn("[UserManager] Firebase Auth login failed:", firebaseError?.message);

                    // ユーザーが存在しない場合は作成を試みる
                    if (firebaseError?.code === "auth/user-not-found") {
                        try {
                            logger.info("[UserManager] User not found, attempting to create user");
                            await createUserWithEmailAndPassword(this.auth, email, password);
                            logger.info("[UserManager] New user created and logged in successfully");
                            return;
                        }
                        catch (createError) {
                            logger.error("[UserManager] Failed to create new user:", createError);
                        }
                    }
                    // すべての方法が失敗した場合は元のエラーをスロー
                    throw firebaseError;
                }
            }
            else {
                // 本番環境では通常のFirebase認証のみを使用
                await signInWithEmailAndPassword(this.auth, email, password);
            }
        }
        catch (error) {
            logger.error("[UserManager] Email/password login error:", error);
            throw error;
        }
    }

    // ログアウト
    public async logout(): Promise<void> {
        try {
            await signOut(this.auth);
            // ログアウト処理はonAuthStateChangedで検知される
        }
        catch (error) {
            logger.error("[UserManager] Logout error:", error);
            throw error;
        }
    }

    // 認証イベントのリスナーを追加
    public addEventListener(listener: AuthEventListener): () => void {
        this.listeners.push(listener);

        // 既に認証済みの場合は即座に通知
        if (this.auth.currentUser && this.currentFluidToken) {
            listener({
                user: this.getCurrentUser()!,
            });
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

    // Firebaseに認証済みかどうかを確認
    public isAuthenticated(): boolean {
        return !!this.auth.currentUser;
    }

    // 現在のFluid Relayトークンを取得（なければ取得を試みる）
    public async getCurrentFluidToken(forceRefresh = false): Promise<IFluidToken | null> {
        // 既存のトークン更新が進行中の場合はそのプロミスを返す
        if (this.tokenRefreshPromise) {
            logger.info("[UserManager] Token refresh already in progress, waiting...");
            return this.tokenRefreshPromise;
        }

        // トークンが存在しないか強制更新が要求された場合
        if ((forceRefresh || !this.currentFluidToken) && this.isAuthenticated() && !this.isRefreshingToken) {
            try {
                // 更新中フラグをセット（無限ループ防止）
                this.isRefreshingToken = true;

                logger.info("[UserManager] No token available, attempting to refresh");

                // 更新処理をプロミスとして保存（他の呼び出しが同じプロミスを共有できるように）
                this.tokenRefreshPromise = new Promise<IFluidToken | null>(async resolve => {
                    // タイムアウト処理
                    const timeoutId = setTimeout(() => {
                        logger.warn("[UserManager] Token refresh timed out after", this.TOKEN_REFRESH_TIMEOUT, "ms");
                        this.isRefreshingToken = false;
                        this.tokenRefreshPromise = null;
                        resolve(this.currentFluidToken); // タイムアウト時は現在の状態を返す
                    }, this.TOKEN_REFRESH_TIMEOUT);

                    try {
                        await this.refreshToken();
                        clearTimeout(timeoutId);
                        resolve(this.currentFluidToken);
                    }
                    catch (error) {
                        logger.error("[UserManager] Failed to get fluid token:", error);
                        clearTimeout(timeoutId);
                        resolve(this.currentFluidToken); // エラー時は現在の状態を返す
                    }
                    finally {
                        this.isRefreshingToken = false;
                        this.tokenRefreshPromise = null;
                    }
                });

                return await this.tokenRefreshPromise;
            }
            catch (error) {
                logger.error("[UserManager] Error in getCurrentFluidToken:", error);
                this.isRefreshingToken = false;
                this.tokenRefreshPromise = null;
                return this.currentFluidToken;
            }
        }

        return this.currentFluidToken;
    }

    // 同期バージョンも保持（互換性のため）
    public getFluidTokenSync(): IFluidToken | null {
        if (this.isRefreshingToken) {
            logger.warn("[UserManager] Warning: Token is being refreshed, returning current value synchronously");
        }
        return this.currentFluidToken;
    }

    // Fluid Relayに接続する際に必要なユーザー情報
    public getFluidUserInfo(): { id: string; name: string; } | null {
        const currentUser = this.getCurrentUser();
        if (!currentUser) return null;

        return {
            id: currentUser.id,
            name: currentUser.name,
        };
    }

    // Firebase認証の完了を待機するためのヘルパーメソッド
    private waitForFirebaseAuth(timeoutMs = 10000): Promise<boolean> {
        return new Promise(resolve => {
            // すでに認証済みなら即座に完了
            if (this.auth.currentUser) {
                return resolve(true);
            }

            // タイムアウト用のタイマー
            const timeoutId = setTimeout(() => {
                unsubscribe();
                logger.warn("[UserManager] Firebase auth state timeout after", timeoutMs, "ms");
                resolve(false);
            }, timeoutMs);

            // 認証状態変更のリスナー
            const unsubscribe = this.auth.onAuthStateChanged(user => {
                if (user) {
                    clearTimeout(timeoutId);
                    unsubscribe();
                    resolve(true);
                }
            });
        });
    }

    // トークンをリフレッシュする
    public async refreshToken(containerId?: string): Promise<string | null> {
        if (this.isRefreshingToken) {
            logger.info("[UserManager] Token refresh already in progress, waiting...");
            return this.tokenRefreshPromise?.then(token => token?.token || null) || null;
        }

        this.isRefreshingToken = true;

        // リフレッシュの詳細をログ出力
        if (containerId) {
            logger.info(`[UserManager] Refreshing token specifically for container: ${containerId}`);
        }
        else {
            logger.info(`[UserManager] Refreshing token (no specific container)`);
        }

        try {
            // Firebase認証を待機
            const isAuthenticated = await this.waitForFirebaseAuth();
            if (!isAuthenticated || !this.auth.currentUser) {
                console.warn("[UserManager] Cannot refresh token - user not authenticated");
                return null;
            }

            // IDトークンを取得
            const idToken = await this.auth.currentUser.getIdToken(true);

            // Fluidトークンを取得
            this.currentFluidToken = await this.getFluidToken(idToken, containerId);

            if (containerId && this.currentFluidToken.containerId !== containerId) {
                console.warn(
                    `[UserManager] Warning: Requested token for container ${containerId} ` +
                        `but received token for ${this.currentFluidToken.containerId || "unspecified container"}`,
                );
            }

            return this.currentFluidToken.token;
        }
        catch (error) {
            logger.error("[UserManager] Token refresh failed:", error);
            // エラーを上位に伝播させる
            throw error;
        }
        finally {
            this.isRefreshingToken = false;
            this.tokenRefreshPromise = null;
        }
    }

    // クリーンアップ
    public dispose(): void {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        this.listeners = [];
    }
}

export const userManager = new UserManager();
