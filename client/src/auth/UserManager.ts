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
}

export type AuthEventListener = (authResult: IAuthResult | null) => void;

export class UserManager {
    private auth = getAuth(app);
    private listeners: AuthEventListener[] = [];
    private unsubscribeAuth: (() => void) | null = null;
    private isDevelopment = import.meta.env.DEV;
    private isMockMode = false;
    private isTestMode = false;
    private useEmulator = false;

    constructor() {
        if (typeof window !== "undefined") {
            const isTest = window.localStorage?.getItem("VITE_IS_TEST") === "true";
            const useEmulator = window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true";
            this.isTestMode = isTest;
            this.useEmulator = useEmulator;
            // If in E2E test environment but not using Firebase Emulator, start in Mock Mode
            if (isTest && !useEmulator) {
                this.isMockMode = true;
                logger.info("[UserManager] Starting in Mock Mode (E2E without Emulator)");
            }
        }
        this.initAuthListenerAsync();
    }

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

            this.notifyListeners({
                user,
            });

            logger.debug("handleUserSignedIn completed successfully");
        } catch (error) {
            logger.error("Error handling user sign in", error);
            this.notifyListeners(null);
        }
    }

    private handleUserSignedOut(): void {
        logger.debug("User signed out");
        this.notifyListeners(null);
    }

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

    private async initAuthListenerAsync(): Promise<void> {
        if (this.isMockMode) {
            logger.info("[UserManager] Mock Mode: Simulating user sign-in");
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

                    // Auto-login for E2E tests using emulator if signed out
                    if (this.isTestMode && this.useEmulator) {
                        logger.info("[UserManager] E2E test detected, attempting auto-login");
                        this.loginWithEmailPassword("test@example.com", "password").catch(err => {
                            logger.error("[UserManager] Auto-login failed", err);
                        });
                    }
                }
            });
        } catch (error) {
            logger.error("Failed to initialize auth listener", error);
            setTimeout(() => {
                this.initAuthListenerAsync();
            }, 1000);
        }
    }

    public async loginWithGoogle(): Promise<void> {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(this.auth, provider);
        } catch (error) {
            logger.error("[UserManager] Google login error", error);
            throw error;
        }
    }

    public async loginWithEmailPassword(email: string, password: string): Promise<void> {
        if (this.isMockMode) {
            logger.info("[UserManager] Mock Mode: Simulating email/password login");
            const user: IUser = { id: "test-user", name: "Test User", email };
            this.notifyListeners({ user });
            return;
        }
        try {
            logger.info(`[UserManager] Attempting email/password login for: ${email}`);

            if (this.isDevelopment) {
                try {
                    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
                    logger.info("[UserManager] Email/password login successful via Firebase Auth", {
                        userId: userCredential.user.uid,
                    });
                    return;
                } catch (firebaseError) {
                    const errorObj = firebaseError as { message?: string; code?: string; };
                    logger.warn("[UserManager] Firebase Auth login failed:", errorObj.message);

                    if (errorObj.code === "auth/user-not-found" || errorObj.code === "auth/invalid-credential") {
                        try {
                            logger.info(
                                "[UserManager] User not found or invalid credentials, attempting to create/reset user",
                            );
                            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
                            logger.info("[UserManager] New user created and logged in successfully", {
                                userId: userCredential.user.uid,
                            });
                            return;
                        } catch (createError) {
                            logger.error("[UserManager] Failed to create new user", createError);
                        }
                    }
                    throw firebaseError;
                }
            } else {
                await signInWithEmailAndPassword(this.auth, email, password);
            }
        } catch (error) {
            logger.error("[UserManager] Email/password login error", error);
            throw error;
        }
    }

    public async logout(): Promise<void> {
        if (this.isMockMode) {
            this.notifyListeners(null);
            return;
        }
        try {
            await signOut(this.auth);
        } catch (error) {
            logger.error("[UserManager] Logout error", error);
            throw error;
        }
    }

    public addEventListener(listener: AuthEventListener): () => void {
        this.listeners.push(listener);

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

        return () => {
            const index = this.listeners.indexOf(listener);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
    }

    private notifyListeners(authResult: IAuthResult | null): void {
        for (const listener of this.listeners) {
            listener(authResult);
        }
    }

    public manualNotifyListeners(authResult: IAuthResult | null): void {
        this.notifyListeners(authResult);
    }

    public isAuthenticated(): boolean {
        return this.isMockMode || !!this.auth.currentUser;
    }

    public dispose(): void {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        this.listeners = [];
    }

    public async refreshToken(): Promise<void> {
        try {
            const current = this.auth.currentUser;
            if (!current) {
                logger.warn("[UserManager] refreshToken called without currentUser");
                return;
            }
            await current.getIdToken(true);
            const user = this.getCurrentUser();
            if (user) {
                this.notifyListeners({ user });
            }
        } catch (err) {
            logger.error("[UserManager] refreshToken failed", err);
        }
    }

    public async getIdToken(forceRefresh: boolean = false): Promise<string | undefined> {
        if (this.isMockMode) {
            return "mock-id-token";
        }
        const current = this.auth.currentUser;
        if (!current) {
            return undefined;
        }
        return await current.getIdToken(forceRefresh);
    }
}

export const userManager = new UserManager();

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        (window as any).__USER_MANAGER__ = userManager;
    }
}
