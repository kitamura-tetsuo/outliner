import { FieldValue, type Firestore, getFirestore } from "firebase-admin/firestore";

const UUID_TITLE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,200}$/;

export interface ProjectDescriptor {
    projectId: string;
    title: string;
}

export class ProjectDirectoryError extends Error {
    constructor(
        public readonly code:
            | "invalid_title"
            | "not_found"
            | "forbidden"
            | "title_conflict"
            | "ambiguous_title"
            | "duplicate_title",
        message: string,
        public readonly debug?: Record<string, unknown>,
    ) {
        super(message);
    }
}

export function normalizeProjectTitle(value: unknown): string {
    if (typeof value !== "string") {
        throw new ProjectDirectoryError("invalid_title", "Project title must be a string");
    }
    const title = value.trim().normalize("NFC");
    if (!title || title.length > 255) {
        throw new ProjectDirectoryError("invalid_title", "Project title must contain 1 to 255 characters");
    }
    if (UUID_TITLE.test(title)) {
        throw new ProjectDirectoryError("invalid_title", "Project title must not be a project ID");
    }
    return title;
}

export function validateProjectId(value: unknown): string {
    if (typeof value !== "string" || !PROJECT_ID.test(value)) {
        throw new ProjectDirectoryError("not_found", "Project not found");
    }
    return value;
}

function descriptorFromData(
    uid: string,
    projectId: string,
    data: FirebaseFirestore.DocumentData | undefined,
): ProjectDescriptor {
    if (!data) {
        throw new ProjectDirectoryError("not_found", "Canonical project descriptor was not found", {
            internalOperation: "descriptorFromData",
            projectId,
            descriptorState: "missing",
        });
    }
    const accessibleUserIds = data.accessibleUserIds;
    if (!Array.isArray(accessibleUserIds) || !accessibleUserIds.includes(uid)) {
        throw new ProjectDirectoryError("forbidden", "Project is inaccessible", {
            internalOperation: "descriptorFromData",
            projectId,
            descriptorState: "unauthorized",
        });
    }
    try {
        return { projectId, title: normalizeProjectTitle(data.title) };
    } catch (error) {
        if (error instanceof ProjectDirectoryError) {
            throw new ProjectDirectoryError(error.code, error.message, {
                internalOperation: "descriptorFromData.normalizeProjectTitle",
                projectId,
                descriptorState: "invalid_title",
                storedTitleType: typeof data.title,
                storedTitleEqualsProjectId: data.title === projectId,
            });
        }
        throw error;
    }
}

export async function getAuthorizedProjectDescriptorForWrite(
    uid: string,
    projectId: string,
    firestore: Firestore = getFirestore(),
): Promise<ProjectDescriptor> {
    validateProjectId(projectId);
    const snapshot = await firestore.collection("projectUsers").doc(projectId).get();
    return descriptorFromData(uid, projectId, snapshot.exists ? snapshot.data() : undefined);
}

export async function listAccessibleProjectDescriptors(
    uid: string,
    firestore: Firestore = getFirestore(),
    onQuarantinedDescriptor?: (error: ProjectDirectoryError) => void,
): Promise<ProjectDescriptor[]> {
    const snapshot = await firestore.collection("projectUsers")
        .where("accessibleUserIds", "array-contains", uid)
        .get();
    // A legacy or partially migrated descriptor must not make every otherwise
    // valid project inaccessible. Individual reads and all writes remain
    // strict; directory listing only quarantines malformed entries.
    return snapshot.docs
        .flatMap(document => {
            try {
                return [descriptorFromData(uid, document.id, document.data())];
            } catch (error) {
                if (error instanceof ProjectDirectoryError && error.code === "invalid_title") {
                    onQuarantinedDescriptor?.(error);
                    return [];
                }
                throw error;
            }
        })
        .sort((left, right) => left.title.localeCompare(right.title) || left.projectId.localeCompare(right.projectId));
}

export async function resolveAccessibleProjectTitle(
    uid: string,
    requestedTitle: unknown,
    firestore: Firestore = getFirestore(),
): Promise<ProjectDescriptor> {
    const title = normalizeProjectTitle(requestedTitle);
    const matches = (await listAccessibleProjectDescriptors(uid, firestore))
        .filter(project => project.title === title);
    if (matches.length === 0) {
        throw new ProjectDirectoryError("not_found", "Accessible project not found");
    }
    if (matches.length > 1) {
        throw new ProjectDirectoryError("ambiguous_title", "Project title is ambiguous");
    }
    return matches[0]!;
}

export async function renameProject(
    uid: string,
    projectId: string,
    requestedTitle: unknown,
    firestore: Firestore = getFirestore(),
): Promise<ProjectDescriptor> {
    validateProjectId(projectId);
    const title = normalizeProjectTitle(requestedTitle);
    const collection = firestore.collection("projectUsers");
    const ref = collection.doc(projectId);

    return await firestore.runTransaction(async transaction => {
        const duplicateQuery = collection.where("title", "==", title).limit(2);
        const [duplicates, snapshot] = await Promise.all([
            transaction.get(duplicateQuery),
            transaction.get(ref),
        ]);
        const descriptor = descriptorFromData(uid, projectId, snapshot.exists ? snapshot.data() : undefined);
        const conflictingDocument = duplicates.docs.find(document => document.id !== projectId);
        if (conflictingDocument) {
            throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
        }
        if (descriptor.title !== title) {
            transaction.update(ref, { title, updatedAt: FieldValue.serverTimestamp() });
        }
        return { projectId, title };
    });
}

/**
 * Validate the canonical resource-side descriptor before a maintenance path
 * opens or mutates the corresponding Yjs room. A missing descriptor may be
 * created only from the caller's explicit title; existing metadata is never
 * renamed as a side effect of seeding.
 */
export async function ensureProjectDescriptorForWrite(
    uid: string,
    projectId: string,
    requestedTitle: unknown,
    firestore: Firestore = getFirestore(),
): Promise<ProjectDescriptor> {
    validateProjectId(projectId);
    const title = normalizeProjectTitle(requestedTitle);
    const collection = firestore.collection("projectUsers");
    const ref = collection.doc(projectId);

    return await firestore.runTransaction(async transaction => {
        const duplicateQuery = collection.where("title", "==", title).limit(2);
        const [duplicates, snapshot] = await Promise.all([
            transaction.get(duplicateQuery),
            transaction.get(ref),
        ]);
        if (duplicates.docs.some(document => document.id !== projectId)) {
            throw new ProjectDirectoryError("duplicate_title", "Project title is already in use");
        }
        if (!snapshot.exists) {
            transaction.set(ref, {
                projectId,
                title,
                accessibleUserIds: [uid],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { projectId, title };
        }

        const existingTitle = descriptorFromData(uid, projectId, snapshot.data()).title;
        if (existingTitle !== title) {
            throw new ProjectDirectoryError(
                "title_conflict",
                "Requested project title does not match the canonical project title",
            );
        }

        return { projectId, title: existingTitle };
    });
}
