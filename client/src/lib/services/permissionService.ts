import { doc, getDoc, getFirestore } from "firebase/firestore";
import { ProjectRole } from "../../types/permissions";
import type { FirestoreProject } from "../../types/project";
import { getFirebaseApp } from "../firebase-app";

const getProject = async (projectId: string): Promise<FirestoreProject | null> => {
    const app = getFirebaseApp();
    const db = getFirestore(app);
    const projectRef = doc(db, "projects", projectId);
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
        const data = projectSnap.data() as Partial<FirestoreProject>;
        return {
            id: data.id ?? projectId,
            title: data.title ?? "",
            deletedAt: data.deletedAt ?? 0,
            deletedBy: data.deletedBy ?? "",
            ownerId: data.ownerId ?? "",
            permissions: Array.isArray(data.permissions) ? data.permissions : [],
            permissionsMap: data.permissionsMap,
        };
    }
    return null;
};

export const hasPermission = async (projectId: string, userId: string, requiredRole: ProjectRole): Promise<boolean> => {
    const project = await getProject(projectId);
    if (!project) {
        return false;
    }

    if (project.ownerId && project.ownerId === userId) {
        return true;
    }

    const mapRole = project.permissionsMap?.[userId];
    if (typeof mapRole === "number") {
        return mapRole >= requiredRole;
    }

    const permission = project.permissions.find(p => p.userId === userId);
    if (!permission) {
        return false;
    }

    return permission.role >= requiredRole;
};

export const canEdit = async (projectId: string, userId: string): Promise<boolean> => {
    return await hasPermission(projectId, userId, ProjectRole.Editor);
};

export const canDelete = async (projectId: string, userId: string): Promise<boolean> => {
    return await hasPermission(projectId, userId, ProjectRole.Owner);
};

export const canManagePermissions = async (projectId: string, userId: string): Promise<boolean> => {
    return await hasPermission(projectId, userId, ProjectRole.Owner);
};
