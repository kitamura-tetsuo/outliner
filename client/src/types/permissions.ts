export enum ProjectRole {
    None = 0,
    Viewer = 1,
    Editor = 2,
    Owner = 3,
}

export interface ProjectPermission {
    userId: string;
    role: ProjectRole;
    grantedAt: number;
    grantedBy: string;
}
