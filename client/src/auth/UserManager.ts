import {
    createUserWithEmailAndPassword,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    type User as FirebaseUser,
} from "firebase/auth";
import { app } from "../lib/firebase-app";
import { getLogger } from "../lib/logger";

const logger = getLogger("UserManager");

export interface IUser {
    id: string;
    name: string;
    email?: string;
    photoURL?: string;
    providerIds?: string[];
}

export interface IAuthResult {
    user: IUser;
    // fluidToken removed
}

export type AuthEventListener = (authResult: IAuthResult | null) => void;

export class UserManager {
    private auth = getAuth(app);
    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;
    private isDevelopment = import.meta.env.DEV;

    constructor() {
        if (typeof window !== "undefined") {
            const isTest = window.localStorage?.getItem("VITE_IS_TEST") === "true";
            const useEmulator = window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true";
            // If in E2E test environment but not using Firebase Emulator, start in Mock Mode
            if (isTest && !useEmulator) {
                this.isMockMode = true;
                logger.info("[UserManager] Starting in Mock Mode (E2E without Emulator)");
            }
        }
        this.initAuthListenerAsync();
    }

    // Process when user signs in
    private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
        try {
            logger.debug("handleUserSignedIn started", {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
            });

            const providerIds: string[] = [];
            firebaseUser.providerData.forEach((profile) => {
                providerIds.push(profile.providerId);
            });
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
            // Treat as authentication failure if an error occurs
            this.notifyListeners(null);
        }
    }

    // Process when user signs out
    private handleUserSignedOut(): void {
        logger.debug("User signed out");
        this.notifyListeners(null);
    }

    private isMockMode = false;

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
            // Ensure Firebase app and auth initialization
            const auth = this.auth;
            // ... existing logic ...
            logger.debug("Firebase Auth initialized, setting up listener");

            this.unsubscribeAuth = onAuthStateChanged(auth, async firebaseUser => {
                // ... existing logic ...
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
            // Authentication state change is detected by onAuthStateChanged
        } catch (error) {
            logger.error({ error }, "[UserManager] Google login error");
            throw error;
        }
    }

    // Login with Email and Password (for development environment)
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

            // If development environment
            if (this.isDevelopment) {
                try {
                    // Try normal Firebase authentication first
                    logger.debug("[UserManager] Calling signInWithEmailAndPassword");
                    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
                    logger.info("[UserManager] Email/password login successful via Firebase Auth", {
                        userId: userCredential.user.uid,
                    });
                    return;
                } catch (firebaseError) {
                    const errorObj = firebaseError as { message?: string; code?: string; };
                    logger.warn("[UserManager] Firebase Auth login failed:", errorObj.message);

                    // If user does not exist, try to create one
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
                    // If all methods fail, throw original error
                    throw firebaseError;
                }
            } else {
                // In production environment, use only normal Firebase authentication
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
            // Logout processing is detected by onAuthStateChanged
        } catch (error) {
            logger.error({ error }, "[UserManager] Logout error");
            throw error;
        }
    }

    // Add listener for authentication events
    public addEventListener(listener: AuthEventListener): () => void {
        this.listeners.push(listener);

        // If already authenticated, notify immediately (FluidToken not needed)
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

    // Notify listeners of authentication state change
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

    // For testing and development: Explicitly refresh ID token and notify listeners
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
                // Notification updates auth parameter of provider via attachTokenRefresh
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
