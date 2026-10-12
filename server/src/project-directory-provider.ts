import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import {
    checkContainerAccess as firestoreCheckContainerAccess,
    findAccessibleProjectIds as firestoreFindAccessibleProjectIds,
} from "./access-control.js";
import {
    ensureProjectDescriptorForWrite as firestoreEnsureDescriptor,
    getAuthorizedProjectDescriptorForWrite as firestoreGetDescriptor,
    listAccessibleProjectDescriptors as firestoreListDescriptors,
    type ProjectDescriptor,
    ProjectDirectoryError,
    renameProject as firestoreRenameProject,
    resolveAccessibleProjectTitle as firestoreResolveTitle,
} from "./project-directory.js";

export type { ProjectDescriptor, ProjectDirectoryError };

/**
 * Bounded storage boundary for project-directory and project-access metadata.
 *
 * This interface covers descriptor creation, lookup, listing, title
 * resolution, rename, project access checks and accessible-ID discovery.
 * The Firestore adapter below is the only producer in this stage; a future
 * SQLite producer implements this same interface without changing callers.
 *
 * ID-domain note: the `^[A-Za-z0-9_-]{1,200}$` project-ID domain and the
 * trim/NFC title rules are Firestore-adapter validation (see
 * `project-directory.ts`). This interface itself defines no ID domain: other
 * providers may support different ID shapes, and generic callers must not
 * pre-validate IDs against the Firestore expression.
 */
export interface ProjectDirectoryProvider {
    readonly kind: "firestore" | "local-sqlite";
    getDescriptor(uid: string, projectId: string): Promise<ProjectDescriptor>;
    listDescriptors(
        uid: string,
        onQuarantinedDescriptor?: (error: ProjectDirectoryError) => void,
    ): Promise<ProjectDescriptor[]>;
    resolveTitle(uid: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    ensureDescriptor(uid: string, projectId: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    rename(uid: string, projectId: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    checkAccess(uid: string, projectId: string): Promise<boolean>;
    findAccessibleIds(uid: string): Promise<string[]>;
}

function bindFirestore(firestore: Firestore | undefined): Firestore | undefined {
    return firestore;
}

/** Firestore-backed producer: the default cloud implementation. */
export function createFirestoreProjectDirectoryProvider(firestore?: Firestore): ProjectDirectoryProvider {
    const db = bindFirestore(firestore);
    const withDb = (explicit?: Firestore): Firestore | undefined => explicit ?? db ?? undefined;
    return {
        kind: "firestore",
        getDescriptor: (uid, projectId) => firestoreGetDescriptor(uid, projectId, withDb() ?? getFirestore()),
        listDescriptors: (uid, onQuarantined) =>
            firestoreListDescriptors(uid, withDb() ?? getFirestore(), onQuarantined),
        resolveTitle: (uid, requestedTitle) => firestoreResolveTitle(uid, requestedTitle, withDb() ?? getFirestore()),
        ensureDescriptor: (uid, projectId, requestedTitle) =>
            firestoreEnsureDescriptor(uid, projectId, requestedTitle, withDb() ?? getFirestore()),
        rename: (uid, projectId, requestedTitle) =>
            firestoreRenameProject(uid, projectId, requestedTitle, withDb() ?? getFirestore()),
        // Boolean/ID-list facades retain their legacy denied/empty fallback:
        // a storage error fails closed and is never reported as a canonical
        // directory success.
        checkAccess: (uid, projectId) => firestoreCheckContainerAccess(uid, projectId, withDb()),
        findAccessibleIds: uid => firestoreFindAccessibleProjectIds(uid, withDb()),
    };
}

let defaultProvider: ProjectDirectoryProvider | undefined;

/**
 * Resolve the server-consumable provider. Only "firestore" exists in this
 * stage; it is selected by default with no local password, local database or
 * new cloud configuration required.
 */
export function resolveProjectDirectoryProvider(kind?: string): ProjectDirectoryProvider {
    const selected = kind ?? process.env.PROJECT_DIRECTORY_PROVIDER ?? "firestore";
    if (selected !== "firestore") {
        throw new Error(`Unsupported project directory provider: ${selected}`);
    }
    return createFirestoreProjectDirectoryProvider();
}

/** Default cloud provider singleton for production server callers. */
export function getDefaultProjectDirectoryProvider(): ProjectDirectoryProvider {
    defaultProvider ??= resolveProjectDirectoryProvider("firestore");
    return defaultProvider;
}

/** Test-only reset for the default provider singleton. */
export function resetDefaultProjectDirectoryProvider(): void {
    defaultProvider = undefined;
}
