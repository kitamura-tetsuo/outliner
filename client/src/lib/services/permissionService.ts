import { doc, getDoc } from "firebase/firestore";
import { ProjectRole } from "../../types/permissions";
import type { FirestoreProject } from "../../types/project";
import { db } from "../firebase-app";

const getProject = async (projectId: string): Promise<FirestoreProject | null> => {
    const projectRef = doc(db, "projects", projectId);
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
        return projectSnap.data() as FirestoreProject;
    }
    return null;
};

export const hasPermission = async (projectId: string, userId: string, requiredRole: ProjectRole): Promise<boolean> => {
    const project = await getProject(projectId);
    if (!project) {
        return false;
    }

    if (project.ownerId === userId) {
        return true;
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
