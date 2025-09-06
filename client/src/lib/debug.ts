import { goto } from "$app/navigation";
import { userManager } from "../auth/UserManager";
import * as snapshotService from "../services/snapshotService";
import { getLogger } from "./logger";

const logger = getLogger();

export function setupGlobalDebugFunctions() {
    if (typeof window !== "undefined") {
        (window as any).__SVELTE_GOTO__ = goto;
        (window as any).__USER_MANAGER__ = userManager;
        (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

declare global {
    interface Window {
        __SVELTE_GOTO__?: typeof goto;
        __USER_MANAGER__?: typeof userManager;
        __SNAPSHOT_SERVICE__?: typeof snapshotService;
    }
}

if (process.env.NODE_ENV === "test" && typeof window !== "undefined") {
    (window as any).__SVELTE_GOTO__ = goto;
    (window as any).__USER_MANAGER__ = userManager;
    (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
    logger.debug("Global debug functions initialized");
}
