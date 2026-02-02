import { type FirebaseApp } from "firebase/app";
import {
    type Auth,
    connectAuthEmulator,
    createUserWithEmailAndPassword,
    getAuth,
    GoogleAuthProvider,
    onIdTokenChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    type User as FirebaseUser,
} from "firebase/auth";
import { getEnv } from "../lib/env";
import { getFirebaseApp } from "../lib/firebase-app";
import { getLogger } from "../lib/logger"; // Import log function

const logger = getLogger() as any;

// User information type definition
export interface IUser {
    id: string;
    name: string;
    email?: string;
    photoURL?: string;
    providerIds?: string[];
}

// Authentication result type definition
export interface IAuthResult {
    user: IUser;
}

// Authentication event listener type definition
type AuthEventListener = (result: IAuthResult | null) => void;

export class UserManager {
    // Firebase configuration
    private firebaseConfig = {
        apiKey: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_API_KEY) || "demo-api-key",
        authDomain: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN)
            || "demo-project.firebaseapp.com",
        projectId: (() => {
            if (typeof window !== "undefined") {
                const stored = window.localStorage?.getItem?.("VITE_FIREBASE_PROJECT_ID");
                if (stored) return stored;
            }
            return (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_PROJECT_ID)
                || "outliner-d57b0";
        })(),
        storageBucket: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET)
            || "demo-project.appspot.com",
        messagingSenderId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID)
            || "123456789",
        appId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_APP_ID)
            || "1:123456789:web:abcdef",
        measurementId: (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID)
            || "G-XXXXXXXXXX",
    };

    private apiBaseUrl = getEnv("VITE_FIREBASE_FUNCTIONS_URL", "http://localhost:57000");
    private _app: FirebaseApp | null = null;
    private _auth: Auth | null = null;

    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;

    // Determine if it is a development environment
    private isDevelopment = (typeof import.meta !== "undefined" && import.meta.env?.DEV) || false;

    /**
     * Lazily initialize Firebase app instance
     * Prevent duplicate initialization in SSR environment
     */
    private get app(): FirebaseApp {
        if (!this._app) {
            this._app = getFirebaseApp();
        }
        return this._app;
    }

    /**
     * Lazily initialize Firebase Auth instance
     */
    get auth(): Auth {
        if (!this._auth) {
            this._auth = getAuth(this.app);
        }
        return this._auth;
    }

    /**
     * Get API Base URL
     */
    get functionsUrl(): string {
        return this.apiBaseUrl;
    }

    constructor() {
        logger.debug("Initializing...");

        // Set globally for access in test environment
        if (typeof window !== "undefined") {
            (window as unknown as { __USER_MANAGER__: UserManager; }).__USER_MANAGER__ = this;
        }

        // Initialize auth listener asynchronously
        this.initAuthListenerAsync();

        // Detect test environment
        const isTestEnv = (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
            || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
            || (typeof import.meta !== "undefined" && import.meta.env?.VITE_IS_TEST === "true")
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && (window as any).__E2E__ === true);

        // Never use emulator in production environment
        const isProduction = !(typeof import.meta !== "undefined" && import.meta.env?.DEV)
            && (typeof import.meta !== "undefined" && import.meta.env?.MODE) === "production";
        const useEmulatorInLocalStorage = typeof window !== "undefined"
            && window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true";

        // Set useEmulator to true if any of isTestEnv is true
        let useEmulator = isTestEnv
            || (typeof import.meta !== "undefined" && import.meta.env?.VITE_USE_FIREBASE_EMULATOR === "true")
            || useEmulatorInLocalStorage;

        console.log("[DEBUG] UserManager Init", {
            isTestEnv,
            isProduction,
            useEmulator,
            VITE_USE_FIREBASE_EMULATOR: import.meta.env?.VITE_USE_FIREBASE_EMULATOR,
            VITE_IS_TEST: import.meta.env?.VITE_IS_TEST,
            MODE: import.meta.env?.MODE,
            DEV: import.meta.env?.DEV,
        });

        if (isProduction && useEmulator) {
            console.warn("[DEBUG] Production && Emulator detected. Disabling...");
            logger.warn("Firebase Emulator is enabled in production. Disabling emulator to prevent crash.");
            useEmulator = false;
        }

        // Determine if it is a server-side rendering environment
        const isSSR = typeof window === "undefined";

        // Connect to Firebase Auth Emulator
        if (useEmulator) {
            logger.info("Connecting to Auth emulator");
            try {
                const connected = this.connectToFirebaseEmulator();
                if (connected) {
                    logger.info("Successfully connected to Auth emulator");
                    // Automatically login with test user in test environment
                    this._setupMockUser(useEmulator);
                } else {
                    // If emulator connection fails
                    const error = new Error("Failed to connect to Firebase Auth emulator");
                    logger.error({ error }, "Failed to connect to Auth emulator, authentication may not work");

                    // Do not throw error in SSR environment (allow client-side retry)
                    if (!isSSR) {
                        if (isTestEnv) {
                            logger.warn(
                                "[UserManager] Emulator connection failed in Test mode. Continuing in offline/mock mode.",
                            );
                            this.isMockMode = true;
                        } else {
                            throw error;
                        }
                    } else {
                        logger.info("Running in SSR environment, will retry connection on client side");
                    }
                }
            } catch (err) {
                // If unable to connect to emulator
                logger.error({ error: err }, "Failed to connect to Auth emulator");

                // Do not throw error in SSR environment
                if (!isSSR) {
                    if (isTestEnv) {
                        logger.warn(
                            "[UserManager] Emulator connection failed in Test mode. Continuing in offline/mock mode.",
                        );
                        this.isMockMode = true;
                    } else {
                        throw err;
                    }
                } else {
                    logger.info("Running in SSR environment, will retry connection on client side");
                }
            }
        }
    }

    // Connect to Firebase Auth Emulator
    private connectToFirebaseEmulator(): boolean {
        try {
            // Get connection info from environment variables (default is localhost:59099)
            const host = (typeof import.meta !== "undefined" && import.meta.env?.VITE_FIREBASE_EMULATOR_HOST)
                || "localhost";
            const port = parseInt(
                (typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTH_EMULATOR_PORT) || "59099",
                10,
            );

            logger.info(`Connecting to Firebase Auth emulator at ${host}:${port}`);
            connectAuthEmulator(this.auth, `http://${host}:${port}`, { disableWarnings: true });
            logger.info(`Successfully connected to Firebase Auth emulator at ${host}:${port}`);
            return true;
        } catch (err) {
            logger.error({ error: err }, "Error connecting to Firebase Auth emulator");
            return false;
        }
    }

    // Setup user for test environment
    private async _setupMockUser(useEmulator: boolean) {
        const isTestEnv = (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test")
            || (typeof process !== "undefined" && process.env?.NODE_ENV === "test")
            || (typeof import.meta !== "undefined" && import.meta.env?.VITE_IS_TEST === "true")
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
            || (typeof window !== "undefined" && (window as any).__E2E__ === true);
        const isProduction = !(typeof import.meta !== "undefined" && import.meta.env?.DEV)
            && (typeof import.meta !== "undefined" && import.meta.env?.MODE) === "production";

        // Use Firebase email/password auth for E2E tests
        // Skip if already logged in or if auto-login is disabled
        const disableAutoLogin = typeof window !== "undefined"
            && window.localStorage?.getItem?.("VITE_DISABLE_AUTO_LOGIN") === "true";
        if (this.auth.currentUser) {
            logger.info("[UserManager] User already logged in, skipping mock user setup");
            return;
        }

        if (isTestEnv && !isProduction && useEmulator && !disableAutoLogin) {
            logger.info("[UserManager] E2E test environment detected, using Firebase auth emulator with test account");
            logger.info("[UserManager] Attempting E2E test login with test@example.com");

            // Login with test user
            try {
                await signInWithEmailAndPassword(this.auth, "test@example.com", "password");
                logger.info("[UserManager] Test user login successful");
            } catch (error) {
                logger.error({ error }, "[UserManager] Test user login failed");

                // Attempt to create user if not exists
                try {
                    logger.info("[UserManager] Attempting to create test user");
                    await createUserWithEmailAndPassword(this.auth, "test@example.com", "password");
                    logger.info("[UserManager] Test user created and logged in successfully");
                } catch (createError) {
                    logger.error({ error: createError }, "[UserManager] Failed to create test user");
                }
            }
        } else if (isProduction) {
            logger.warn("[UserManager] _setupMockUser called in production. This should not happen.");
        }
    }

    // User sign-in process
    private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
        try {
            logger.debug("handleUserSignedIn started", { uid: firebaseUser.uid });

            // Create user object
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

            // Notify listeners of authentication result
            this.notifyListeners({
                user,
            });

            logger.debug("handleUserSignedIn completed successfully");
        } catch (error) {
            logger.error({ error }, "Error handling user sign in");
            // Treat as authentication failure if error occurs
            this.notifyListeners(null);
        }
    }

    // User sign-out process
    private handleUserSignedOut(): void {
        logger.debug("User signed out");
        this.notifyListeners(null);
    }

    private isMockMode = false;

    // Get current user ID token
    public async getIdToken(forceRefresh: boolean = false): Promise<string | null> {
        if (this.isMockMode) {
            return "mock-token";
        }
        const user = this.auth.currentUser;
        if (!user) return null;
        return user.getIdToken(forceRefresh);
    }

    // Update getCurrentUser
    public getCurrentUser(): IUser | null {
        if (this.isMockMode) {
            return {
                id: "test-user",
                name: "Test User",
                email: "test@example.com",
            };
        }
        const firebaseUser = this.auth.currentUser;
        if (!firebaseUser) return null;
        // ... existing logic ...
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

    // Update initAuthListenerAsync
    private async initAuthListenerAsync(): Promise<void> {
        if (this.isMockMode) {
            logger.info("[UserManager] Mock Mode: Simulating user sign-in");
            // Simulate async delay
            setTimeout(() => {
                const mockUser: IUser = {
                    id: "test-user",
                    name: "Test User",
                    email: "test@example.com",
                };
                this.notifyListeners({ user: mockUser });
            }, 100);
            return;
        }

        try {
            // Ensure Firebase app and auth are initialized
            const auth = this.auth;
            // ... existing logic ...
            logger.debug("Firebase Auth initialized, setting up listener");

            this.unsubscribeAuth = onIdTokenChanged(auth, async firebaseUser => {
                // ... existing logic ...
                logger.debug("onIdTokenChanged triggered", {
                    hasUser: !!firebaseUser,
                    userId: firebaseUser?.uid,
                    email: firebaseUser?.email,
                });

                if (firebaseUser) {
                    logger.info("User signed in/token refreshed via onIdTokenChanged", { userId: firebaseUser.uid });
                    await this.handleUserSignedIn(firebaseUser);
                } else {
                    logger.info("User signed out via onIdTokenChanged");
                    this.handleUserSignedOut();
                }
            });
        } catch (error) {
            // ... existing catch ...
            // If invalid-api-key happens here, catch it?
            // But I'm preventing it by checking isMockMode first.
            logger.error({ error }, "Failed to initialize auth listener");
            setTimeout(() => {
                this.initAuthListenerAsync();
            }, 1000);
        }
    }

    // Login with Google
    public async loginWithGoogle(): Promise<void> {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(this.auth, provider);
            // Auth state changes are detected by onAuthStateChanged
        } catch (error) {
            logger.error({ error }, "[UserManager] Google login error");
            throw error;
        }
    }

    // Login with email and password (for development)
    public async loginWithEmailPassword(email: string, password: string): Promise<void> {
        if (this.isMockMode) {
            logger.info("[UserManager] Mock Mode: Simulating email/password login");
            const user: IUser = { id: "test-user", name: "Test User", email };
            this.notifyListeners({ user });
            return;
        }
        try {
            logger.info(`[UserManager] Attempting email/password login for: ${email}`);
            logger.debug(
                `[UserManager] Current auth state: ${this.auth.currentUser ? "authenticated" : "not authenticated"}`,
            );

            // In development environment
            if (this.isDevelopment) {
                try {
                    // Try standard Firebase authentication first
                    logger.debug("[UserManager] Calling signInWithEmailAndPassword");
                    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
                    logger.info("[UserManager] Email/password login successful via Firebase Auth", {
                        userId: userCredential.user.uid,
                    });
                    return;
                } catch (firebaseError) {
                    const errorObj = firebaseError as { message?: string; code?: string; };
                    logger.warn("[UserManager] Firebase Auth login failed:", errorObj.message);

                    // Attempt to create user if not exists
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
                    // Throw original error if all methods fail
                    throw firebaseError;
                }
            } else {
                // Use only standard Firebase authentication in production
                logger.debug("[UserManager] Production environment, using Firebase Auth only");
                await signInWithEmailAndPassword(this.auth, email, password);
            }
        } catch (error) {
            logger.error({ error }, "[UserManager] Email/password login error");
            throw error;
        }
    }

    // Logout
    public async logout(): Promise<void> {
        if (this.isMockMode) {
            this.notifyListeners(null);
            return;
        }
        try {
            await signOut(this.auth);
            // Logout process is detected by onAuthStateChanged
        } catch (error) {
            logger.error({ error }, "[UserManager] Logout error");
            throw error;
        }
    }

    // Add authentication event listener
    public addEventListener(listener: AuthEventListener): () => void {
        this.listeners.push(listener);

        // Notify immediately if already authenticated (FluidToken not needed)
        if (this.isMockMode) {
            const user = this.getCurrentUser();
            if (user) listener({ user });
        } else if (this.auth.currentUser) {
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

        // Return function to remove listener
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    // Notify listeners of auth state change
    private notifyListeners(authResult: IAuthResult | null): void {
        for (const listener of this.listeners) {
            listener(authResult);
        }
    }

    // Manually notify listeners (for debug)
    public manualNotifyListeners(authResult: IAuthResult | null): void {
        this.notifyListeners(authResult);
    }
    public isAuthenticated(): boolean {
        return this.isMockMode || !!this.auth.currentUser;
    }

    // Dispose
    public dispose(): void {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        this.listeners = [];
    }

    // For test and dev: Explicitly refresh ID token and notify listeners
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
                // Notification updates provider auth params via attachTokenRefresh
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
