import { ProjectRole } from "../../types/permissions";

interface PermissionStore {
    userRole: ProjectRole;
}

export const permissionStore = $state<PermissionStore>({
    userRole: ProjectRole.Viewer,
});
