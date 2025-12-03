import type { ProjectPermission } from "../../schema/app-schema";

/**
 * Role hierarchy values
 * Owner (2) > Editor (1) > Viewer (0)
 */
export enum RoleLevel {
    VIEWER = 0,
    EDITOR = 1,
    OWNER = 2,
}

/**
 * Convert role string to numeric level
 */
export function getRoleLevel(role: "owner" | "editor" | "viewer"): number {
    switch (role) {
        case "owner":
            return RoleLevel.OWNER;
        case "editor":
            return RoleLevel.EDITOR;
        case "viewer":
            return RoleLevel.VIEWER;
        default:
            return RoleLevel.VIEWER;
    }
}

/**
 * Check if a user has the required permission level
 */
export function hasPermission(
    permissions: ProjectPermission[],
    userId: string,
    requiredRole: "owner" | "editor" | "viewer",
): boolean {
    const userPermission = permissions.find(p => p.userId === userId);
    if (!userPermission) {
        return false;
    }

    const userLevel = getRoleLevel(userPermission.role);
    const requiredLevel = getRoleLevel(requiredRole);

    return userLevel >= requiredLevel;
}

/**
 * Check if user can edit project (Editor or Owner)
 */
export function canEdit(
    permissions: ProjectPermission[],
    userId: string,
): boolean {
    return hasPermission(permissions, userId, "editor");
}

/**
 * Check if user can delete project (Owner only)
 */
export function canDelete(
    permissions: ProjectPermission[],
    userId: string,
): boolean {
    return hasPermission(permissions, userId, "owner");
}

/**
 * Check if user can manage permissions (Owner only)
 */
export function canManagePermissions(
    permissions: ProjectPermission[],
    userId: string,
): boolean {
    return hasPermission(permissions, userId, "owner");
}

/**
 * Get user's role in a project
 */
export function getUserRole(
    permissions: ProjectPermission[],
    userId: string,
): "owner" | "editor" | "viewer" | null {
    const userPermission = permissions.find(p => p.userId === userId);
    return userPermission?.role ?? null;
}

/**
 * Get owner of the project
 */
export function getProjectOwner(
    permissions: ProjectPermission[],
): ProjectPermission | undefined {
    return permissions.find(p => p.role === "owner");
}

/**
 * Add or update a permission
 */
export function upsertPermission(
    permissions: ProjectPermission[],
    userId: string,
    role: "owner" | "editor" | "viewer",
    grantedBy: string,
): ProjectPermission[] {
    const existingIndex = permissions.findIndex(p => p.userId === userId);

    if (existingIndex >= 0) {
        // Update existing permission
        const updated = [...permissions];
        updated[existingIndex] = {
            ...updated[existingIndex],
            role,
            grantedAt: Date.now(),
            grantedBy,
        };
        return updated;
    } else {
        // Add new permission
        return [
            ...permissions,
            {
                userId,
                role,
                grantedAt: Date.now(),
                grantedBy,
            },
        ];
    }
}

/**
 * Remove a permission
 */
export function removePermission(
    permissions: ProjectPermission[],
    userId: string,
): ProjectPermission[] {
    return permissions.filter(p => p.userId !== userId);
}

/**
 * Get all editors and owners (users who can edit)
 */
export function getEditors(
    permissions: ProjectPermission[],
): ProjectPermission[] {
    return permissions.filter(
        p => p.role === "owner" || p.role === "editor",
    );
}

/**
 * Get all viewers (users who can only view)
 */
export function getViewers(
    permissions: ProjectPermission[],
): ProjectPermission[] {
    return permissions.filter(p => p.role === "viewer");
}
