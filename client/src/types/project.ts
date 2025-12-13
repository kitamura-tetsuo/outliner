import type { ProjectPermission } from "./permissions";

export interface FirestoreProject {
    id: string;
    title: string;
    deletedAt: number;
    deletedBy: string;
    ownerId: string;
    permissions: ProjectPermission[];
    permissionsMap?: Record<string, number>;
    isPublic?: boolean;
    publicAccessToken?: string;
}
