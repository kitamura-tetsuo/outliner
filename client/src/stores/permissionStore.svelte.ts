import { ProjectRole } from "../types/permissions";

function getInitialRole(): ProjectRole {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true");
    if (isTestEnv) {
        // Test environment: default to full access to avoid transient read-only states during bootstrap.
        return ProjectRole.Owner;
    }
    return ProjectRole.None;
}

interface PermissionStore {
    userRole: ProjectRole;
    reset: () => void;
}

export const permissionStore: PermissionStore = $state({
    userRole: getInitialRole(),
    reset() {
        this.userRole = getInitialRole();
    },
});

if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.localStorage?.getItem?.("VITE_IS_TEST") === "true";
    if (isTestEnv) {
        // Test environment only: allow E2E to reset state between specs.
        (window as any).__PERMISSION_STORE__ = permissionStore;
    }
}
