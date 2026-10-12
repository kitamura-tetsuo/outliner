import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import {
    checkContainerAccess as firestoreCheckContainerAccess,
    findAccessibleProjectIds as firestoreFindAccessibleProjectIds,
} from "./access-control.js";
import {
    ensureProjectDescriptorForWrite,
    getAuthorizedProjectDescriptorForWrite,
    listAccessibleProjectDescriptors,
    type ProjectDescriptor,
    ProjectDirectoryError,
    renameProject,
    resolveAccessibleProjectTitle,
} from "./project-directory.js";

export type { ProjectDescriptor };
export { ProjectDirectoryError };

/**
 * Server-consumable project-directory/access provider boundary.
 *
 * This covers descriptor creation, lookup, listing, title resolution and
 * rename together with their associated resource-side access/discovery
 * operations. The Firestore implementation below remains the default cloud
 * producer; no local password, local database or new cloud configuration is
 * required to select it.
 *
 * The boundary itself performs no project-ID validation: ID domains belong
 * to each provider (the Firestore adapter accepts opaque strings matching
 * ^[A-Za-z0-9_-]{1,200}$ via the Firestore implementation), so a future
 * producer must not inherit Firestore's ID shape from this interface.
 */
export interface ProjectDirectoryProvider {
    readonly kind: string;
    getDescriptor(uid: string, projectId: string): Promise<ProjectDescriptor>;
    listDescriptors(
        uid: string,
        onQuarantinedDescriptor?: (error: ProjectDirectoryError) => void,
    ): Promise<ProjectDescriptor[]>;
    resolveTitle(uid: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    ensureDescriptor(uid: string, projectId: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    renameProject(uid: string, projectId: string, requestedTitle: unknown): Promise<ProjectDescriptor>;
    checkAccess(uid: string, projectId: string): Promise<boolean>;
    findAccessibleIds(uid: string): Promise<string[]>;
}

/**
 * Firestore-backed cloud producer. An explicitly supplied instance is used
 * when present (tests, maintenance callers); otherwise the default
 * Firestore database is resolved per call, matching the previous direct
 * Firestore call sites.
 */
export function createFirestoreProjectDirectoryProvider(firestore?: Firestore): ProjectDirectoryProvider {
    const db = (): Firestore | undefined => firestore ?? getFirestore();
    return {
        kind: "firestore",
        getDescriptor: (uid, projectId) => getAuthorizedProjectDescriptorForWrite(uid, projectId, db()),
        listDescriptors: (uid, onQuarantinedDescriptor) =>
            listAccessibleProjectDescriptors(uid, db(), onQuarantinedDescriptor),
        resolveTitle: (uid, requestedTitle) => resolveAccessibleProjectTitle(uid, requestedTitle, db()),
        ensureDescriptor: (uid, projectId, requestedTitle) =>
            ensureProjectDescriptorForWrite(uid, projectId, requestedTitle, db()),
        renameProject: (uid, projectId, requestedTitle) => renameProject(uid, projectId, requestedTitle, db()),
        checkAccess: (uid, projectId) => firestoreCheckContainerAccess(uid, projectId, db()),
        findAccessibleIds: uid => firestoreFindAccessibleProjectIds(uid, db()),
    };
}

let defaultProvider: ProjectDirectoryProvider | undefined;

/**
 * Default server provider: the Firestore cloud implementation. Selecting it
 * requires no local storage, password session or additional configuration.
 */
export function getProjectDirectoryProvider(): ProjectDirectoryProvider {
    defaultProvider ??= createFirestoreProjectDirectoryProvider();
    return defaultProvider;
}

/** Test/maintenance seam to replace the process-wide default provider. */
export function setProjectDirectoryProvider(provider: ProjectDirectoryProvider | undefined): void {
    defaultProvider = provider;
}
