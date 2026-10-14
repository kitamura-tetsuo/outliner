import { goto, type GotoOptions } from "$app/navigation";
import { resolve } from "$app/paths";
import { userManager } from "../auth/UserManager";
import * as yjsHighService from "../lib/yjsService.svelte";
import { Items } from "../schema/app-schema";
import * as snapshotService from "../services/snapshotService";
import { yjsStore } from "../stores/yjsStore.svelte";
import { getLogger } from "./logger";

const logger = getLogger();

/**
 * Base prefix of this deployment, derived from the official path-resolution
 * primitive: resolve("/") is the base-prefixed root ("/" when no base is
 * configured). Kept behind a function so tests can observe the real value.
 */
export function deploymentBase(): string {
    const root = resolve("/");
    return root === "/" ? "" : root.replace(/\/$/, "");
}

/**
 * Prepends the configured application base to an app-root-relative debug
 * target exactly once, preserving its query/fragment suffix.
 *
 * SvelteKit's goto() resolves root-relative URLs against the origin without
 * applying the base itself, so the bridge must carry it. Only a single
 * leading slash marks an app-root-relative target (protocol-relative `//`
 * URLs, relative paths and absolute URLs pass through untouched), and a
 * target that already carries the base is returned unchanged. This is pure
 * base-prefixing: the opaque caller-supplied URL is never passed through
 * route-ID resolution, so encoded characters and query/fragment data are
 * never reinterpreted as route parameters.
 */
export function withConfiguredBase(url: string, configuredBase: string = deploymentBase()): string {
    if (!configuredBase) return url;
    if (!url.startsWith("/") || url.startsWith("//")) return url;
    const boundary = url.search(/[?#]/);
    const pathname = boundary === -1 ? url : url.slice(0, boundary);
    const suffix = boundary === -1 ? "" : url.slice(boundary);
    if (pathname === configuredBase || pathname.startsWith(`${configuredBase}/`)) return url;
    return `${configuredBase}${pathname}${suffix}`;
}

export function setupGlobalDebugFunctions() {
    if (typeof window !== "undefined") {
        // In Playwright tests, avoid exposing goto to prevent navigation loops.
        const win = window as unknown as Window & Record<string, unknown>;
        if (process.env.NODE_ENV !== "test") {
            win.__SVELTE_GOTO__ = async (
                url: string,
                opts?: GotoOptions,
            ) => {
                await Promise.resolve();
                return new Promise<void>((resolve, reject) => {
                    // Opaque debug URL: already app-root-relative, never a
                    // route ID. The configured base is applied once above.
                    goto(withConfiguredBase(url), opts).then(() => resolve()).catch(reject);
                });
            };
        } else {
            try {
                delete win.__SVELTE_GOTO__;
            } catch (_e) {
                logger.error(_e);
            }
        }
        // Service / Store / User Manager
        win.__FLUID_SERVICE__ = yjsHighService;
        win.__FLUID_STORE__ = yjsStore; // keep legacy name for helpers
        win.__USER_MANAGER__ = userManager;
        win.__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

declare global {
    interface Window {
        getFluidTreeDebugData?: () => Record<string, unknown>;
        getFluidTreePathData?: (path?: string) => Record<string, unknown>;
        getYjsTreeDebugData?: () => Record<string, unknown>;
        getYjsTreePathData?: (path?: string) => unknown;
        __FLUID_SERVICE__?: typeof yjsHighService;
        __FLUID_STORE__?: typeof yjsStore;
        __USER_MANAGER__?: typeof userManager;
        __SNAPSHOT_SERVICE__?: typeof snapshotService;
    }
}

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        const testWin = window as unknown as Window & Record<string, unknown>;
        // Do not expose __SVELTE_GOTO__ in tests to force page.goto in helpers
        try {
            delete testWin.__SVELTE_GOTO__;
        } catch (_e) {
            logger.error(_e);
        }
        testWin.__FLUID_SERVICE__ = yjsHighService;
        testWin.__FLUID_STORE__ = yjsStore;
        testWin.__USER_MANAGER__ = userManager;
        testWin.__SNAPSHOT_SERVICE__ = snapshotService;

        // Debug function to get SharedTree data structure
        window.getFluidTreeDebugData = function(): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                return { error: "YjsClient not initialized", items: [] };
            }
            return (yjsStore.yjsClient as unknown as { getAllData: () => Record<string, unknown>; }).getAllData();
        };

        // Debug function to get data at a specific path
        window.getFluidTreePathData = function(path?: string): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                return { error: "YjsClient not initialized", items: [] };
            }
            return (yjsStore.yjsClient as { getTreeAsJson: (path?: string) => Record<string, unknown>; }).getTreeAsJson(
                path,
            );
        };

        // Yjs tree structure debug helpers
        window.getYjsTreeDebugData = function(): Record<string, unknown> {
            const client = yjsStore.yjsClient;
            if (!client) {
                return { error: "YjsClient not initialized", items: [] };
            }
            const fc = client as { project?: { ydoc: unknown; tree: unknown; items: unknown; }; };
            if (!fc?.project) {
                return { error: "FluidClient project not initialized", items: [] };
            }
            const project = fc.project;
            const toPlain = (
                item: { id: string; text?: { toString: () => string; }; key: string; },
            ): { id: string; text: string; items: unknown[]; } => {
                const children = new Items(
                    project.ydoc as import("yjs").Doc,
                    project.tree as import("yjs-orderedtree").YTree,
                    item.key,
                );
                return {
                    id: item.id,
                    text: item.text?.toString() ?? "",
                    items: [...children].map(child => toPlain(child as import("../schema/app-schema").Item)),
                };
            };
            const rootItems = project.items as Items;
            return {
                itemCount: rootItems.length,
                items: [...rootItems].map(item => toPlain(item as import("../schema/app-schema").Item)),
            };
        };

        window.getYjsTreePathData = function(path?: string): unknown {
            const data = window.getYjsTreeDebugData?.();
            if (!path) return data ?? {};
            const result = path.split(".").reduce((prev: unknown, curr: string) => {
                if (prev && typeof prev === "object") {
                    return (prev as Record<string, unknown>)[curr];
                }
                return undefined;
            }, data);
            return result;
        };

        logger.debug("Global debug functions initialized");
    }
}
