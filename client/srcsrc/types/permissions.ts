export enum ProjectRole {
  Viewer = 0,
  Editor = 1,
  Owner = 2,
}

export interface ProjectPermission {
  userId: string;
  role: ProjectRole;
  grantedAt: number;
  grantedBy: string;
}
