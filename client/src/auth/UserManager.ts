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
import {
    getLogger,
    log,
} from "../lib/logger"; // log関数をインポート

const logger = getLogger();

// ユーザー情報の型定義
export interface IUser {
    id: string;
    name: string;
    email?: string;
    photoURL?: string;
}

// Fluid Relayトークンの型定義
export interface IFluidToken {
    token: string;
    user: {
        id: string;
        name: string;
    };
    tenantId?: string; // サーバーから受け取ったテナントIDを格納できるように追加
    containerId?: string; // 対象コンテナID
}

// 認証結果の型定義
export interface IAuthResult {
    user: IUser;
}

// 認証イベントリスナーの型定義
export type AuthEventListener = (result: IAuthResult | null) => void;

export class UserManager {
    private static instance: UserManager;

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

    private apiBaseUrl = getEnv("VITE_API_BASE_URL", "http://localhost:7071").replace("localhost", "192.168.50.16");
    private apiServerUrl = getEnv("VITE_API_SERVER_URL", "http://localhost:7071").replace("localhost", "192.168.50.16");
    private app = initializeApp(this.firebaseConfig);
    private auth = getAuth(this.app);

    private currentFluidToken: IFluidToken | null = null;
    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;
    private isRefreshingToken = false; // トークン更新中フラグ
    private tokenRefreshPromise: Promise<IFluidToken | null> | null = null;
    private readonly TOKEN_REFRESH_TIMEOUT = 10000; // 10秒のタイムアウト

    // 開発環境かどうかの判定
    private isDevelopment = import.meta.env.DEV || import.meta.env.MODE === "development" ||
        process.env.NODE_ENV === "development";

    // シングルトンパターン
    public static getInstance(): UserManager {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager();
        }
        return UserManager.instance;
    }

    private constructor() {
        logger.debug("Initializing...");

        this.initAuthListener();

        // テスト環境の検出を強化
        const isTestEnv = import.meta.env.MODE === "test" ||
            process.env.NODE_ENV === "test" ||
            import.meta.env.VITE_IS_TEST === "true" ||
            (typeof window !== "undefined" && window.mockFluidClient);

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
        const isBrowser = typeof window !== "undefined";

        try {
            const emulatorHost = import.meta.env.VITE_AUTH_EMULATOR_HOST || "firebase-emulator";
            const emulatorPort = parseInt(import.meta.env.VITE_AUTH_EMULATOR_PORT || "9099", 10);

            const host = isBrowser ? emulatorHost : "192.168.50.16";
            const port = emulatorPort;

            logger.info(`Attempting to connect to Firebase Auth emulator at ${host}:${port}`);
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
    private _setupMockUser() {
        // E2Eテスト用にFirebaseメール/パスワード認証を使う
        if (
            typeof window !== "undefined" &&
            (window.location.href.includes("e2e-test") || import.meta.env.VITE_IS_TEST === "true")
        ) {
            logger.info("[UserManager] E2E test environment detected, using real Firebase auth with test account");

            // 認証試行前に長めに待機（Emulatorが起動するまで）
            setTimeout(() => {
                logger.info("[UserManager] Attempting E2E test login with test@example.com");

                // 複数のエミュレータ接続設定を試す
                this._tryMultipleEmulatorConnections();
            }, 2000); // Emulatorの起動を待つために2秒待機に延長
            return;
        }

        // モックユーザーは使用せず、常に実際のFirebase認証を使用
        logger.info("[UserManager] Using real Firebase auth only, no mock users");
    }

    // 複数のエミュレータ接続設定を順番に試す
    private async _tryMultipleEmulatorConnections() {
        // Firestoreが成功している接続先を優先する
        const firestoreHost = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST;

        const emulatorConfigs = [
            // Firestoreが接続している設定を最優先
            { host: firestoreHost || "192.168.50.16", port: 9099 },
            { host: "192.168.50.16", port: 9099 },
            // 以下は元の設定
            { host: "firebase-emulator", port: 9099 },
            { host: "localhost", port: 9099 },
            { host: "127.0.0.1", port: 9099 },
            { host: window.location.hostname, port: 9099 },
        ];

        logger.info(
            `Trying emulator connections in order: ${emulatorConfigs.map(c => `${c.host}:${c.port}`).join(", ")}`,
        );

        let successful = false;

        for (const { host, port } of emulatorConfigs) {
            try {
                logger.info(`Trying emulator at ${host}:${port}`);

                // 新しい Auth インスタンスを作成（既存の接続をリセット）
                const tempApp = initializeApp(this.firebaseConfig, `temp-app-${Math.random()}`);
                const tempAuth = getAuth(tempApp);

                // エミュレータに接続
                connectAuthEmulator(tempAuth, `http://${host}:${port}`, { disableWarnings: true });

                // ログイン試行
                logger.info(`Attempting login with test@example.com via ${host}:${port}`);
                try {
                    // テストユーザーでのログイン試行
                    const result = await signInWithEmailAndPassword(tempAuth, "test@example.com", "password");
                    logger.info(`Login successful via ${host}:${port}!`, { uid: result.user.uid });

                    try {
                        // 成功した接続情報で本来のauth接続を設定
                        connectAuthEmulator(this.auth, `http://${host}:${port}`, { disableWarnings: true });

                        // 本来のauthインスタンスで再ログイン
                        // ここでのログインでonAuthStateChangedが呼ばれる
                        await signInWithEmailAndPassword(this.auth, "test@example.com", "password");

                        successful = true;
                        return; // 成功したらループを抜ける
                    }
                    catch (reconnectError) {
                        // メインの認証インスタンスの再接続に失敗した場合
                        // この警告はエラーではなく、通常の動作の一部として扱う
                        if (reconnectError.code === "auth/emulator-config-failed") {
                            // エミュレータ設定が既に行われている場合は問題なし
                            logger.info(
                                `Auth emulator already configured, using successful login from ${host}:${port}`,
                            );

                            // 直接ログインを試みる
                            await signInWithEmailAndPassword(this.auth, "test@example.com", "password");

                            successful = true;
                            return; // 成功したとしてループを抜ける
                        }
                        else {
                            // その他のエラーの場合は警告を記録
                            logger.info(
                                `Successfully logged in with test user on ${host}:${port}, but failed to reconnect main auth instance:`,
                                reconnectError,
                            );
                        }
                    }
                }
                catch (error) {
                    // エラーがFirebaseErrorかどうかを確認
                    const firebaseError = error as { code?: string; };

                    // auth/user-not-found エラーの場合、その接続先でユーザーを作成する
                    if (firebaseError.code === "auth/user-not-found") {
                        logger.info(
                            `Firebase connection to ${host}:${port} successful, but test user not found. Attempting to create user directly.`,
                        );

                        try {
                            // Firebase Auth REST APIを直接使用してユーザーを作成
                            const response = await fetch(
                                `http://${host}:${port}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.firebaseConfig.apiKey}`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        email: "test@example.com",
                                        password: "password",
                                        returnSecureToken: true,
                                    }),
                                },
                            );

                            if (response.ok) {
                                logger.info(`Successfully created test user on ${host}:${port}`);

                                try {
                                    // 成功した接続情報で本来のauth接続を設定
                                    connectAuthEmulator(this.auth, `http://${host}:${port}`, { disableWarnings: true });

                                    // 作成したユーザーでログイン
                                    await signInWithEmailAndPassword(this.auth, "test@example.com", "password");

                                    successful = true;
                                    return; // 成功したらループを抜ける
                                }
                                catch (loginError) {
                                    logger.info(`Created user but failed to reconnect main auth instance:`, loginError);
                                }
                            }
                            else {
                                const errorData = await response.json();
                                logger.info(`Failed to create test user directly: ${JSON.stringify(errorData)}`);
                            }
                        }
                        catch (createError) {
                            logger.info(`Error creating test user directly:`, createError);
                        }
                    }
                    else {
                        // その他のエラーの場合は次の設定を試す
                        logger.info(`Login failed with ${host}:${port}:`, error);
                    }
                }
            }
            catch (err) {
                // 接続自体に失敗した場合は次の設定を試す
                logger.warn(`Connection failed with ${host}:${port}:`, err);
            }
        }

        // すべてのエミュレーターを試した後も成功しなかった場合
        if (!successful) {
            // APIサーバーを通じて最後にユーザー作成を試みる
            try {
                logger.info("Attempting to create test user via API server");
                const result = await this._createTestUser("192.168.50.16", 9099);

                if (result) {
                    // エミュレータの設定を試みる
                    try {
                        connectAuthEmulator(this.auth, "http://192.168.50.16:9099", { disableWarnings: true });
                    }
                    catch (emulatorError) {
                        logger.warn("Failed to set up emulator, but continuing with login attempt", emulatorError);
                    }

                    // 認証を試みる
                    await signInWithEmailAndPassword(this.auth, "test@example.com", "password");
                    return;
                }
            }
            catch (apiError) {
                logger.error("Failed to create test user via API:", apiError);
            }

            // それでも失敗した場合はエラーをスロー
            const error = new Error("Failed to connect to any Firebase emulator or authenticate test user");
            logger.error("All Firebase emulator connection attempts failed. Authentication will not work.", error);
            throw error;
        }
    }

    // テストユーザーを作成する関数
    private async _createTestUser(host: string, port: number): Promise<boolean> {
        logger.info(`Attempting to create test user in emulator at ${host}:${port}`);

        try {
            // ホスト名がlocalhostやfirebase-emulatorの場合は192.168.50.16に置換
            const emulatorHost = host === "localhost" || host === "firebase-emulator" ? "192.168.50.16" : host;

            // APIサーバーを通じてテストユーザーを作成
            const response = await fetch(`${this.apiBaseUrl}/api/create-test-user`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    emulatorHost,
                    emulatorPort: port,
                    email: "test@example.com",
                    password: "password",
                    displayName: "Test User",
                }),
            });

            if (response.ok) {
                const data = await response.json();
                logger.info("Test user created successfully", data);
                return true;
            }
            else {
                const error = await response.text();
                logger.error("Failed to create test user via API:", error);
                return false;
            }
        }
        catch (error) {
            logger.error("Error creating test user:", error);
            return false;
        }
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

            // Firebase認証ユーザーからIDトークンを取得
            const idToken = await firebaseUser.getIdToken();

            // 認証情報をローカルストレージに保存する
            // ...existing code...

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
                credentials: "include",
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
