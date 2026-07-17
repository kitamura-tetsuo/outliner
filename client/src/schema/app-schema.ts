/**
 * The SharedTree/Yjs schema (Comments/Item/Items/Project) is defined once in the
 * framework-neutral `@outliner/shared` workspace (../../../shared/src) and shared
 * with the server. This module re-exports it and wires the shared logger to the
 * client's pino-based logger so schema logging keeps its browser console styling.
 */
import { getLogger as clientGetLogger } from "../lib/logger";
import { setLoggerFactory } from "$shared/logger";

// Route shared-schema logging through the client's enhanced logger.
setLoggerFactory((name) => clientGetLogger(name));

export * from "$shared/app-schema";
