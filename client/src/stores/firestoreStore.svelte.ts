import { type FirebaseApp } from "firebase/app";
import {
    connectFirestoreEmulator,
    doc,
    type Firestore,
    getDoc,
    getFirestore,
    onSnapshot,
    setDoc,
} from "firebase/firestore";

import { SvelteDate } from "svelte/reactivity";
import { userManager } from "../auth/UserManager";
import { getFirebaseApp } from "../lib/firebase-app";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";
import { getLogger } from "../lib/logger";
const logger = getLogger("firestoreStore");

// User container type definition
export interface UserProject {
    userId: string;
    defaultProjectId: string | null;
    accessibleProjectIds: Array<string>;
    createdAt: Date;
    updatedAt: Date;
}

class GeneralStore {
    // Direct public field
    public userProject = $state<UserProject | null>(null);

    // $state recalculation trigger
    public ucVersion = $state(0);

    // Aliases for backwards compatibility
    get userContainer() {
        return this.userProject;
    }

    // Apply wrap + new reference with explicit API
    setUserProject(value: UserProject | null) {
        const prevVersion = this.ucVersion;
        const prevLength = this.userProject?.accessibleProjectIds?.length ?? 0;
        const prevDefault = this.userProject?.defaultProjectId;

        const nextProject = value ? this.wrapUserProject(value) : null;
        this.userProject = nextProject;

        this.ucVersion = prevVersion + 1;
        // Additional notification (test environment only)
        try {
            const __isTestEnv = import.meta.env.MODE === "test"
                || process.env.NODE_ENV === "test"
                || import.meta.env.VITE_IS_TEST === "true"
                || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
                || (typeof window !== "undefined" && (window as any).__E2E__ === true);
            if (typeof window !== "undefined" && __isTestEnv) {
                window.dispatchEvent(new CustomEvent("firestore-uc-changed"));
            }
        } catch {}

        const nextLength = this.userProject?.accessibleProjectIds?.length ?? 0;
        const nextDefault = this.userProject?.defaultProjectId;

        if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info(
                `[firestoreStore.setUserProject] prev.ucVersion=${prevVersion} prev.len=${prevLength} prev.default=${prevDefault} -> next.ucVersion=${this.ucVersion} next.len=${nextLength} next.default=${nextDefault}`,
            );
        }
    }

    setUserContainer(value: UserProject | null) {
        this.setUserProject(value);
    }
    // For testing: Save current state to Firestore
    async testSaveUserProject() {
        const self = firestoreStore as any;
        if (!self.userProject) return;
        if (!db) return;

        try {
            const userId = self.userProject.userId;
            const userProjectRef = doc(db, "userProjects", userId);
            await setDoc(userProjectRef, self.userProject);
            console.log(`[firestoreStore] Saved userProject to Firestore for ${userId}`);
        } catch (e) {
            console.error("[firestoreStore] Failed to save userProject to Firestore", e);
            throw e;
        }
    }

    // Proxy wrapper to update UI even with Array changes (push/splice, etc.)
    public wrapUserProject(value: UserProject): UserProject {
        const arrayHandler: ProxyHandler<string[]> = {
            get: (target, prop, receiver) => {
                const v = Reflect.get(target, prop, receiver);
                // Hook destructive methods
                if (
                    typeof v === "function"
                    && ["push", "pop", "splice", "shift", "unshift", "sort", "reverse"].includes(String(prop))
                ) {
                    return (...args: any[]) => {
                        const res = (v as any).apply(target, args);
                        // Re-assign to trigger reactivity even with the same reference
                        try {
                            // Create a new array and replace
                            const nextArr = Array.from(target);
                            const next: UserProject = { ...value, accessibleProjectIds: nextArr };
                            // Assign to public proxy to ensure reactivity triggers via Proxy
                            (firestoreStore as any).setUserProject(next); // Ensure ucVersion++ is reflected via API
                        } catch (e) {
                            const err = e instanceof Error ? e : new Error(String(e));
                            logger.warn("Failed to trigger userProject update after array mutation", err);
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
        this.stopFirestoreSync();
    }

    private unsubscribe: (() => void) | null = null;

    public initFirestoreSync(): () => void {
        // Unsubscribe if there is a previous listener
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        const currentUser = userManager.getCurrentUser();
        // Early return if user is not logged in
        if (!currentUser) {
            logger.info("Not starting Firestore observation because user is not logged in");
            return () => {}; // Return cleanup function
        }

        // Add check for user ID existence
        if (!currentUser.id) {
            logger.warn("Not starting Firestore observation because user object has no ID");
            return () => {}; // Return cleanup function
        }

        const userId = currentUser.id;
        logger.info(`Observing userProjects document for user ${userId}`);

        try {
            // Get reference to document (/userProjects/{userId})
            if (!db) {
                logger.error("Firestore db is not initialized in initFirestoreSync");
                return () => {};
            }
            const userProjectRef = doc(db, "userProjects", userId);

            // Real-time update listener with enhanced error handling
            this.unsubscribe = onSnapshot(
                userProjectRef,
                snapshot => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();

                        const projectData: UserProject = {
                            userId: data.userId || userId,
                            defaultProjectId: data.defaultProjectId,
                            accessibleProjectIds: data.accessibleProjectIds || [],
                            createdAt: data.createdAt?.toDate()
                                ? new SvelteDate(data.createdAt.toDate())
                                : new SvelteDate(),
                            updatedAt: data.updatedAt?.toDate()
                                ? new SvelteDate(data.updatedAt.toDate())
                                : new SvelteDate(),
                        };

                        // Stabilization for E2E tests: If userProject is already seeded by test helper
                        // and incoming is an empty array, suppress overwrite (avoid clearing immediately due to empty initial sync)
                        const isTestEnv = import.meta.env.MODE === "test"
                            || process.env.NODE_ENV === "test"
                            || import.meta.env.VITE_IS_TEST === "true"
                            || (typeof window !== "undefined"
                                && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
                            || (typeof window !== "undefined" && (window as any).__E2E__ === true);
                        const hasSeeded = !!(firestoreStore.userProject?.accessibleProjectIds?.length);
                        const incomingEmpty = !(projectData.accessibleProjectIds?.length);
                        if (isTestEnv && hasSeeded && incomingEmpty) {
                            logger.info(
                                "FirestoreStore: keeping seeded userProject; ignoring empty snapshot in test env",
                            );
                        } else {
                            firestoreStore.setUserProject(projectData);
                            logger.info(`Loaded container info for user ${userId}`);
                            logger.info(`Default container ID: ${projectData.defaultProjectId || "None"}`);
                        }
                    } else {
                        logger.info(`Container info for user ${userId} does not exist`);
                    }
                },
                error => {
                    if (error.code === "permission-denied") {
                        logger.warn(
                            `Firestore permission denied for user ${userId}. This is expected if data isn't seeded yet.`,
                        );
                        return;
                    }
                    const err = error instanceof Error ? error : new Error(String(error));
                    logger.error("Firestore listening error", err);
                },
            );

            // Return cleanup function
            return () => {
                if (this.unsubscribe) {
                    this.unsubscribe();
                    this.unsubscribe = null;
                }
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error("Error starting Firestore sync", err);
            return () => {}; // Return cleanup function
        }
    }

    public stopFirestoreSync() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    constructor() {
        // Leave constructor empty
    }
}
// Create store using Svelte 5 runes
// $state is always available because the file has .svelte.ts extension
const __tmpStore = $state(new GeneralStore());
const existingCandidate = typeof window !== "undefined"
    ? (window as any).__FIRESTORE_STORE__
    : (globalThis as any).__FIRESTORE_STORE__;
const shouldReuseExisting = typeof existingCandidate === "object"
    && existingCandidate !== null
    && existingCandidate.__isRealFirestoreStore === true;
export const firestoreStore = (shouldReuseExisting ? existingCandidate : __tmpStore) as typeof __tmpStore;
(firestoreStore as any).__isRealFirestoreStore = true;

// Expose globally in test environment to allow control from E2E
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost"
        || window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
        || (window as any).__E2E__ === true;
    if (isTestEnv) {
        (window as any).__FIRESTORE_STORE__ = firestoreStore;
    }
}

// Initialize Firestore app and database
let app: FirebaseApp | undefined;
let db: Firestore | undefined;

// Initialize Firebase app (once)
try {
    // Use centrally managed Firebase app
    app = getFirebaseApp();
    logger.info("Firebase app initialized via central management");

    // Get Firestore instance
    db = getFirestore(app!);

    // Detect test environment or emulator environment and connect
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.mockFluidClient === false)
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    // Never use emulator in production environment
    const isProduction = process.env.NODE_ENV === "production"
        || import.meta.env.MODE === "production";

    const useEmulator = !isProduction && (
        isTestEnv
        || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true"
        || (typeof window !== "undefined"
            && window.localStorage?.getItem("VITE_USE_FIREBASE_EMULATOR") === "true")
    );

    // Connect to Firebase Emulator
    if (useEmulator) {
        // Get connection info from environment variables (default is localhost:58080)
        const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || "localhost";
        const emulatorPort = parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || "58080", 10);

        // Log emulator connection info
        logger.info(`Connecting to Firestore emulator at ${emulatorHost}:${emulatorPort}`);

        try {
            // Connect to emulator
            connectFirestoreEmulator(db, emulatorHost, emulatorPort);
            logger.info("Successfully connected to Firestore emulator");
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error("Failed to connect to Firestore emulator", err);

            // Notify that we continue in offline mode if connection fails
            logger.warn("Continuing in offline mode. Data operations will be cached until connection is restored.");
        }
    }
} catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Critical error initializing Firestore", err);
    // Ensure app continues to run even if database connection fails
    // Do nothing if app is undefined (handled properly in subsequent processing)
    if (!db && app) {
        db = getFirestore(app);
    }
}

// Save container ID using server API (updates are done only on server side)
export async function saveProjectId(projectId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            throw new Error("User is not logged in");
        }

        // Get Firebase ID token
        const idToken = await userManager.getIdToken();
        if (!idToken) {
            throw new Error("Cannot get authentication token");
        }

        // Call via host adding /api/ prefix
        logger.info(`Saving project ID via /api/saveProject`);

        // Call Firebase Functions to save container ID
        const url = getFirebaseFunctionUrl("saveProject");

        const response = await fetch(url, {
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
        logger.error("Error saving container ID", err);
        return false;
    }
}

// Delete project using server API
export async function deleteProject(projectId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            throw new Error("User is not logged in");
        }

        // In test environment, update directly in userProject store
        if (
            typeof window !== "undefined"
            && (window.mockFluidClient === false
                || import.meta.env.VITE_IS_TEST === "true"
                || (window as any).__E2E__ === true)
        ) {
            logger.info(`Test environment detected, deleting project ID ${projectId} from mock store`);

            if (firestoreStore.userProject) {
                const updatedIds = (firestoreStore.userProject.accessibleProjectIds || [])
                    .filter(id => id !== projectId);

                let defaultProjectId = firestoreStore.userProject.defaultProjectId;
                if (defaultProjectId === projectId) {
                    defaultProjectId = updatedIds.length > 0 ? updatedIds[0] : null;
                }

                firestoreStore.setUserProject({
                    ...firestoreStore.userProject,
                    accessibleProjectIds: updatedIds,
                    defaultProjectId: defaultProjectId,
                    updatedAt: new SvelteDate(),
                });
            }
            return true;
        }

        // Get Firebase ID token
        const idToken = await userManager.getIdToken();
        if (!idToken) {
            throw new Error("Cannot get authentication token");
        }

        logger.info(`Deleting project ID via /api/deleteProject`);

        const url = getFirebaseFunctionUrl("deleteProject");

        const response = await fetch(url, {
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
        logger.error("Error deleting project", err);
        return false;
    }
}

// Get default container ID
export async function getDefaultProjectId(): Promise<string | undefined> {
    try {
        // Check if user is logged in
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.info("Cannot get default project ID: User not logged in. Waiting for login...");
            return undefined;
        }

        // 1. First try to get directly from store (if updated in real time)
        if (firestoreStore.userProject?.defaultProjectId) {
            logger.info(`Found default project ID in store: ${firestoreStore.userProject.defaultProjectId}`);
            return firestoreStore.userProject.defaultProjectId;
        }

        // 2. If no value in store, get directly from Firestore
        try {
            logger.info("No default project found in store, fetching from server...");
            const userId = currentUser.id;

            // Check Firestore import
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
            logger.error("Firestore access error", err);
            // Firestore error is not fatal, so continue
        }

        logger.info("No default project ID found");
        return undefined;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Error getting default container ID", err);
        return undefined;
    }
}

// Aliases for backwards compatibility during containers -> projects migration
export const getDefaultContainerId = getDefaultProjectId;
export const saveContainerId = saveProjectId;

/**
 * Save container ID to server side
 * @param projectId Container ID to save
 * @returns Whether save was successful
 */
export async function saveProjectIdToServer(projectId: string): Promise<boolean> {
    try {
        // In test environment, add directly to userProject store
        if (
            typeof window !== "undefined"
            && (window.mockFluidClient === false
                || import.meta.env.VITE_IS_TEST === "true"
                || window.localStorage.getItem("VITE_USE_TINYLICIOUS") === "true")
        ) {
            logger.info("Test environment detected, saving project ID to mock store");

            // Create or update new container data
            const updatedData = firestoreStore.userProject
                ? {
                    ...firestoreStore.userProject,
                    defaultProjectId: projectId,
                    accessibleProjectIds: firestoreStore.userProject.accessibleProjectIds
                        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary Set for deduplication, not reactive state
                        ? [...new Set([...firestoreStore.userProject.accessibleProjectIds, projectId])]
                        : [projectId],
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    updatedAt: new SvelteDate(),
                }
                : {
                    userId: "test-user-id",
                    defaultProjectId: projectId,
                    accessibleProjectIds: [projectId],
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    createdAt: new SvelteDate(),
                    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timestamp value, not reactive state
                    updatedAt: new SvelteDate(),
                };

            // Update store
            firestoreStore.setUserProject(updatedData);
            logger.info("Project ID saved to mock store", updatedData);

            // Save current container ID to local storage as well
            window.localStorage.setItem("currentProjectId", projectId);

            return true;
        }

        // Use API in production environment
        // Check if user is logged in
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot save project ID to server: User not logged in");
            return false;
        }

        // Get Firebase ID token
        const idToken = await userManager.getIdToken();
        if (!idToken) {
            logger.warn("Cannot save project ID to server: Firebase user not available");
            return false;
        }

        // Get Firebase Functions endpoint
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
        logger.info(`Saving project ID to Firebase Functions at ${apiBaseUrl}`);

        // Call Firebase Functions to save container ID
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
        logger.error("Error saving project ID to server", err);
        return false;
    }
}

// Alias for backwards compatibility during containers -> projects migration
export const saveContainerIdToServer = saveProjectIdToServer;

// Getter alias to access userProject as userContainer (deprecated, move to class)
// Already handled in GeneralStore class

// Automatically initialize when app starts
if (typeof window !== "undefined") {
    const __isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    // Enable automatic sync in E2E test environment (or allow manual call)
    // Want to exclude only unit tests
    const shouldAutoSync = !__isTestEnv || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    if (shouldAutoSync) {
        let cleanup: (() => void) | null = null;

        // Initialize/cleanup Firestore sync when auth state changes
        const unsubscribeAuth = userManager.addEventListener(authResult => {
            // Execute previous cleanup if exists
            if (cleanup) {
                cleanup();
                cleanup = null;
            }

            // Set listener if authenticated
            if (authResult) {
                cleanup = firestoreStore.initFirestoreSync();
            } else {
                firestoreStore.setUserProject(null);
            }
        });

        // Cleanup on page unload
        window.addEventListener("beforeunload", () => {
            if (cleanup) {
                cleanup();
            }
            unsubscribeAuth();
        });
    }
}
