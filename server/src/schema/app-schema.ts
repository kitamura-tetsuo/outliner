/**
 * The SharedTree/Yjs schema (Comments/Item/Items/Project) is defined once in the
 * framework-neutral shared workspace (../../../shared/src) and consumed by both
 * the client and this server. It is re-exported here so existing
 * `./schema/app-schema` imports keep working.
 *
 * Schema-sharing note: the server compiles ../shared/src into its own build (see
 * ../../tsconfig.json rootDir), so the shared code resolves this workspace's
 * single copy of Yjs — no separate package, no dual-package hazard.
 */
export * from "../../../shared/src/app-schema.js";
