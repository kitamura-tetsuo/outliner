import { getLogger } from "../lib/logger";
import { projectRoomPath } from "../lib/yjs/roomPath";
import { getRoomSyncState } from "../lib/yjs/roomSyncState";

import { iterateItems } from "../utils/itemTraversal";
import { safeGetNodeParent } from "../utils/treeUtils";
import { safeDecodeURIComponent } from "../utils/urlUtils";
const logger = getLogger("store");
import { untrack } from "svelte";
import { createSubscriber, SvelteSet } from "svelte/reactivity";
import * as Y from "yjs";
import { saveProjectSnapshot } from "../lib/projectSnapshot";
import type { Items } from "../schema/app-schema";
import { Item, Project } from "../schema/app-schema";
import { globalUndoRouter } from "../services/undo/undoRouter";
import { ITEMS_RELATION_ORIGIN } from "../services/yjstable/itemsRelation";
import { CHECKBOX_ROLLUP_ORIGIN, updateParentCheckboxStatus } from "../utils/checkboxHelpers";
import type { OutlinerViewModel } from "./OutlinerViewModel";

export class GeneralStore {
    // Use $state for pages to ensure proper Svelte reactivity
    private _pagesData = $state<{ items: Items | undefined; }>({ items: undefined });
    // Getter for pages.current that tracks reactivity - set in constructor for proper closure
    pages!: { current: Items | undefined; };
    private _currentPage: Item | undefined;
    private readonly _currentPageSubscribers = new SvelteSet<() => void>();

    constructor() {
        /* eslint-disable @typescript-eslint/no-this-alias -- required for nested getter closure */
        const self = this;
        /* eslint-enable @typescript-eslint/no-this-alias */
        this.pages = {
            get current(): Items | undefined {
                return self._pagesData.items;
            },
        };
    }
    // Item ID of the currently open comment thread (only one is displayed at a time)
    openCommentItemId: string | null = $state(null);
    // Fallback: Also keep the index in case the ID changes, such as when switching connections
    private _project = $state<Project | undefined>(undefined);
    public undoManager: Y.UndoManager | undefined;
    public activeViewModel: OutlinerViewModel | null = null;
    textareaRef: HTMLTextAreaElement | null = null;

    private _subscribeCurrentPage = createSubscriber((update) => {
        this._currentPageSubscribers.add(update);
        return () => this._currentPageSubscribers.delete(update);
    });

    public get currentPage(): Item | undefined {
        // Make it subscribeable from Svelte's $derived/by
        this._subscribeCurrentPage();
        return this._currentPage;
    }
    public set currentPage(v: Item | undefined) {
        // E2E stabilization: Even if the test sets a page for a provisional project,
        // find/create and replace with a page of the same name in the connected project
        try {
            const proj = this._project;
            const page = v;
            if (proj?.ydoc && page?.ydoc && proj.ydoc !== page.ydoc) {
                const title = page?.text?.toString?.() ?? String(page?.text ?? "");
                const items = proj.items;
                let next: Item | undefined;
                // Use efficient iterator to avoid O(N^2) complexity with Items.at(i)
                if (items) {
                    for (const p of items) {
                        if (!p) continue;
                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                        if (String(t).trim().toLowerCase() === String(title).trim().toLowerCase()) {
                            next = p;
                            break;
                        }
                    }
                }
                // REMOVED: Legacy browser-based auto-creation. Tests should use TestHelpers.seedProjectDataOnly for data seeding.
                // If page doesn't exist, do not auto-create it here - let tests fail if seeding was missed.

                // Porting child rows (reflecting preceding seed)
                // DISABLED: Legacy browser-based auto-creation logic causes duplication in E2E tests
                // with server-side seeding. Tests should rely on SeedClient and proper Yjs sync.
                /*
                try {
                    const prevItems = page?.items;
                    const nextItems = next?.items;
                    const prevLen = prevItems?.length ?? 0;
                    const nextLen = nextItems?.length ?? 0;
                    if (prevLen > 0) {
                        const isPlaceholderChild = (node: ItemLike | PlainItemData | null | undefined) => {
                            const text = node?.text?.toString?.() ?? String(node?.text ?? "");
                            if (!text) return true;
                            return text === "First line: Test" || text === "Second line: Yjs reflection"
                                || text === "Third line: Order check";
                        };
                        const shouldReplaceChildren = nextLen === 0
                            || (nextLen <= 3 && (() => {
                                for (let idx = 0; idx < nextLen; idx++) {
                                    const candidate = nextItems?.at ? nextItems.at(idx) : undefined;
                                    if (!isPlaceholderChild(candidate)) {
                                        return false;
                                    }
                                }
                                return true;
                            })());

                        if (shouldReplaceChildren) {
                            while ((nextItems?.length ?? 0) > 0) {
                                nextItems.removeAt(nextItems.length - 1);
                            }

                            const cloneBranch = (source: Items | undefined, target: Items | undefined) => {
                                if (!source || !target) return;
                                const length = source.length ?? 0;
                                for (let index = 0; index < length; index++) {
                                    const from = source.at(index);
                                    if (!from) continue;
                                    const text = from?.text?.toString?.() ?? String(from?.text ?? "");
                                    const created = target.addNode?.("tester");
                                    if (!created) continue;
                                    created.updateText?.(text);
                                    cloneBranch(from.items, created.items);
                                }
                            };
                            cloneBranch(prevItems, nextItems);
                        }
                    }
                } catch {
                    // Ignore errors during child item migration
                }
                */
                this._currentPage = next;
                // Notify
                this._currentPageSubscribers.forEach(fn => {
                    try {
                        fn();
                    } catch (_e) {
                        logger.error(_e);
                    }
                });
                return;
            }
        } catch (_e) {
            logger.error(_e);
        }
        this._currentPage = v;
        // Notify
        this._currentPageSubscribers.forEach(fn => {
            try {
                fn();
            } catch (_e) {
                logger.error(_e);
            }
        });
    }

    public get project(): Project | undefined {
        return this._project;
    }
    // Explicit signal for project updates to ensure Svelte 5 reactivity
    // Fixes #4049: consumers should read this instead of void store.project
    projectVersion = $state(0);

    // Explicit signal for pages updates to ensure Svelte 5 reactivity
    pagesVersion = $state(0);

    // Alias tracking
    aliasesVersion = $state(0);
    private _aliasIndexVersion = -1;
    private _aliasIndexInitialized = false;
    /* eslint-disable-next-line svelte/prefer-svelte-reactivity -- internal index map intentionally avoids fine-grained tracking overhead */
    private _aliasIndex = new Map<string, { item: Item; pageTitle: string; }[]>();
    private _aliasSubscribers = new Map<string, Set<(aliases: { item: Item; pageTitle: string; }[]) => void>>();

    public subscribeToAliases(targetId: string, callback: (aliases: { item: Item; pageTitle: string; }[]) => void) {
        if (!this._aliasSubscribers.has(targetId)) {
            this._aliasSubscribers.set(targetId, new Set());
        }
        this._aliasSubscribers.get(targetId)!.add(callback);

        // Initial call
        callback(this.findReferringAliases(targetId));

        return () => {
            const subs = this._aliasSubscribers.get(targetId);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this._aliasSubscribers.delete(targetId);
                }
            }
        };
    }

    private _notifyAliasSubscribers(targetId: string) {
        const subs = this._aliasSubscribers.get(targetId);
        if (subs) {
            const aliases = this.findReferringAliases(targetId);
            for (const cb of subs) {
                cb(aliases);
            }
        }
    }

    public getAliasIndex(): Map<string, { item: Item; pageTitle: string; }[]> {
        if (!this._aliasIndexInitialized && this._project?.items) {
            this._aliasIndexInitialized = true;
            this._rebuildAliasIndex();
        }
        return this._aliasIndex;
    }

    private _rebuildAliasIndex() {
        this._aliasIndex.clear();
        if (!this._project?.items) return;
        for (const page of iterateItems(this._project.items)) {
            if (!page) continue;
            const pageTitle = String(page.text || "");
            this._traverseForAliases(page, pageTitle, this._aliasIndex);
        }
    }

    // Cache of page names (normalized to lowercase) for O(1) lookup
    private _pageNamesCache = new SvelteSet<string>();

    private _rebuildPageNamesCache() {
        try {
            // Collect new names first
            /* eslint-disable svelte/prefer-svelte-reactivity -- Temporary local Set */
            const newNames = new Set<string>();
            /* eslint-enable svelte/prefer-svelte-reactivity */
            const items = this._project?.items;
            if (items) {
                // Use iterateItems for better performance (O(N) vs O(N log N)) since we just need the set of names
                for (const page of iterateItems(items)) {
                    try {
                        // page.text may be a Y.Text object rather than a plain string in
                        // production; normalize with String() before comparing.
                        const text = String(page.text ?? "");
                        if (text) {
                            newNames.add(text.trim().toLowerCase());
                        }
                    } catch (err) {
                        logger.warn("Failed to read page text while rebuilding page names cache", err);
                    }
                }
            }

            // Sync _pageNamesCache (SvelteSet) with newNames

            untrack(() => {
                // 1. Remove names not in newNames
                for (const name of this._pageNamesCache) {
                    if (!newNames.has(name)) {
                        this._pageNamesCache.delete(name);
                    }
                }

                // 2. Add names from newNames that are not in cache
                for (const name of newNames) {
                    if (!this._pageNamesCache.has(name)) {
                        this._pageNamesCache.add(name);
                    }
                }
            });
        } catch (err) {
            // Fallback: clear cache to avoid stale state if rebuild fails totally
            logger.warn("Failed to rebuild page names cache", err);
            this._pageNamesCache.clear();
        }
    }

    /**
     * Checks if a page with the given name exists in the current project.
     * Uses a cached Set for O(1) performance.
     */
    public hasPageName(title: string): boolean {
        // Normalizes title to lowercase for comparison, ensuring O(1) case-insensitive lookup
        return this._pageNamesCache.has(String(title).trim().toLowerCase());
    }

    /**
     * Finds all items in the current project that refer to the given targetId as their aliasTargetId.
     */
    public findReferringAliases(targetId: string): { item: Item; pageTitle: string; }[] {
        if (!targetId || !this._project?.items) return [];
        void this.aliasesVersion;
        return this.getAliasIndex().get(targetId) || [];
    }

    private _traverseForAliases(
        node: Item,
        pageTitle: string,
        index: Map<string, { item: Item; pageTitle: string; }[]>,
    ) {
        const targetId = node.aliasTargetId;
        if (targetId) {
            let arr = index.get(targetId);
            if (!arr) {
                arr = [];
                index.set(targetId, arr);
            }
            arr.push({ item: node, pageTitle });
        }
        const children = node.items;
        if (children) {
            for (const child of iterateItems(children)) {
                if (!child) continue;
                this._traverseForAliases(child, pageTitle, index);
            }
        }
    }

    public pageExists(name: string): boolean {
        try {
            // Rely on SvelteSet fine-grained reactivity instead of global pagesVersion
            if (!name) return false;
            const normalizedName = name.trim().toLowerCase();
            if (this._pageNamesCache.has(normalizedName)) return true;
            try {
                return this._pageNamesCache.has(decodeURIComponent(normalizedName));
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }

    public set project(v: Project | undefined) {
        if (v === this._project) {
            return;
        }

        // Guard against setting null/undefined - just clear state without observers
        if (!v) {
            this._project = undefined;
            this.projectVersion += 1;
            if (this.undoManager) {
                globalUndoRouter.unregister(this.undoManager);
                this.undoManager.destroy();
                this.undoManager = undefined;
            }
            this._pageNamesCache.clear();
            return;
        }

        this._project = v;
        this.projectVersion += 1;

        if (this.undoManager) {
            globalUndoRouter.unregister(this.undoManager);
            this.undoManager.destroy();
        }
        /* eslint-disable svelte/prefer-svelte-reactivity -- Y.UndoManager internally uses standard Set which is required by its API */
        this.undoManager = new Y.UndoManager(v.ydoc.getMap("orderedTree"), {
            trackedOrigins: new Set([null, ITEMS_RELATION_ORIGIN]),
        });
        globalUndoRouter.register(this.undoManager);
        /* eslint-enable svelte/prefer-svelte-reactivity */

        // Build initial cache
        this._rebuildPageNamesCache();

        saveProjectSnapshot(v);

        // Monitor the root tree with Yjs observeDeep and bridge to Svelte subscription
        const project = v;
        const ymap = project?.ydoc?.getMap?.("orderedTree");

        // Setup observer immediately on the project itself
        let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;
        let updatePending = false;
        let rebuildPending = false;
        let updateAliasesPending = false;

        const handler = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>, _tr?: Y.Transaction) => {
            /* eslint-disable-next-line svelte/prefer-svelte-reactivity -- This set is local to the event loop, no reactivity needed */
            const checkboxParentsToUpdate = new Set<string>();
            // Debounce saveProjectSnapshot to avoid O(N) traversal on every transaction
            if (!snapshotTimeout) {
                // Check if this project provider is still doing its initial sync.
                // If it is, skip saving entirely since it will get saved after sync or on next edit.
                // Read sync state from the room registry, avoiding circular imports or debug globals
                let isInitialSync = false;
                const guid = project?.ydoc?.guid;
                if (guid) {
                    const state = getRoomSyncState(projectRoomPath(guid));
                    // If state is not strictly "synced", it is still pending/retrying/etc.
                    // If undefined, it might not be a connected room yet.
                    if (state && state !== "synced") {
                        isInitialSync = true;
                    }
                }
                if (!isInitialSync) {
                    snapshotTimeout = setTimeout(() => {
                        snapshotTimeout = null;
                        try {
                            saveProjectSnapshot(project);
                        } catch (_e) {
                            logger.error(_e);
                        }
                    }, 3000);
                }
            }

            // Check if we need to rebuild the page name cache
            let shouldRebuild = false;
            let shouldUpdateAliases = false;
            try {
                // Check if any event affects page existence or page titles
                for (const event of events) {
                    // Check for node additions/removals in orderedTree
                    if (event.path.length === 0) {
                        // Change on orderedTree itself
                        if (event.changes.keys.size > 0) {
                            // Check if any added key is a page
                            for (const [key, change] of event.changes.keys) {
                                shouldUpdateAliases = true;
                                if (change.action === "add" || change.action === "update") {
                                    try {
                                        const parent = safeGetNodeParent(project.tree, key);
                                        if (parent === "root") {
                                            shouldRebuild = true;
                                        } else if (parent) {
                                            checkboxParentsToUpdate.add(parent);
                                        }
                                    } catch (_e) {
                                        logger.error(_e);
                                    }
                                } else if (change.action === "delete") {
                                    shouldUpdateAliases = true;
                                    // Conservative approach: rebuild on delete as we can't easily check parent
                                    shouldRebuild = true;
                                }
                            }
                        }
                    } else if (
                        event.keys.has("aliasTargetId")
                        || (event.path.length > 0 && event.path[event.path.length - 1] === "aliasTargetId")
                    ) {
                        shouldUpdateAliases = true;
                    } else if (event.path.length === 1 && event.keys.has("text")) {
                        // Change on a node's property (text) (Top level structure event maybe?)
                        const nodeId = String(event.path[0]);
                        try {
                            const parent = safeGetNodeParent(project.tree, nodeId);
                            if (parent === "root") {
                                shouldRebuild = true;
                            } else if (parent) {
                                checkboxParentsToUpdate.add(parent);
                            }
                        } catch (_e) {
                            logger.error(_e);
                        }
                    } else if (event.path.length >= 2 && event.path[event.path.length - 1] === "text") {
                        // Text updates inside a node (e.g. path: [nodeId, "value", "text"])
                        const nodeId = String(event.path[0]);
                        try {
                            const parent = safeGetNodeParent(project.tree, nodeId);
                            if (parent && parent !== "root") {
                                checkboxParentsToUpdate.add(parent);
                            }
                        } catch (_e) {
                            logger.error(_e);
                        }
                    }
                }
            } catch (_e) {
                logger.error(_e);
            }

            // Only the client that originated the change rolls up: the resulting parent text
            // is replicated like any other edit. If every peer recomputed it, they would all
            // write the same minimal diff concurrently and corrupt the parent's Y.Text.
            const isLocalChange = _tr?.local ?? true;
            if (checkboxParentsToUpdate.size > 0 && isLocalChange && _tr?.origin !== CHECKBOX_ROLLUP_ORIGIN) {
                const parents = Array.from(checkboxParentsToUpdate);
                // Defer out of the observer callback: the roll-up writes back to the same
                // document, which Yjs does not allow while the current transaction cleans up.
                queueMicrotask(() => {
                    project.ydoc.transact(() => {
                        for (const pid of parents) {
                            try {
                                updateParentCheckboxStatus(new Item(project.ydoc, project.tree, pid));
                            } catch (_e) {
                                logger.error(_e);
                            }
                        }
                    }, CHECKBOX_ROLLUP_ORIGIN);
                });
            }

            if (shouldRebuild) {
                rebuildPending = true;
                shouldUpdateAliases = true;
            }
            if (shouldUpdateAliases) {
                updateAliasesPending = true;
            }

            // Batch UI updates and cache rebuilds using microtasks
            if (!updatePending) {
                updatePending = true;
                queueMicrotask(() => {
                    updatePending = false;
                    this.pagesVersion++; // Trigger signal
                    if (updateAliasesPending) {
                        const oldIndex = new Map(this._aliasIndex);
                        this._aliasIndexInitialized = true;
                        this._rebuildAliasIndex();

                        // Notify subscribers
                        const notified = new Set<string>();
                        for (const targetId of this._aliasIndex.keys()) {
                            this._notifyAliasSubscribers(targetId);
                            notified.add(targetId);
                        }
                        for (const targetId of oldIndex.keys()) {
                            if (!notified.has(targetId)) {
                                this._notifyAliasSubscribers(targetId);
                            }
                        }
                        updateAliasesPending = false;
                        this.aliasesVersion++;
                    }
                    this._pagesData.items = project.items;
                    if (rebuildPending) {
                        rebuildPending = false;
                        this._rebuildPageNamesCache();
                    }
                });
            }
        };

        // Monitor both the orderedTree (content) and items (page list) for changes
        try {
            ymap?.observeDeep?.(handler);
            if (project?.items && "observeDeep" in project.items) {
                (project.items as {
                    observeDeep?: (
                        fn: (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => void,
                    ) => void;
                }).observeDeep?.(handler as Parameters<Y.Map<unknown>["observeDeep"]>[0]);
            }
        } catch {
            // Ignore errors during observation setup
        }

        // Update the $state for pages to trigger Svelte reactivity
        this._pagesData.items = project.items;
    }
}

export const store = $state(new GeneralStore());

// Y.Docs backing provisional (pre-connection) projects, so yjsStore can tell when a
// project being replaced was never actually bound to the server and warn if it held
// edits that are about to be discarded, instead of swapping silently.
const provisionalDocs = new WeakSet<Y.Doc>();

export function isProvisionalProject(project: Project | undefined): boolean {
    return !!project?.ydoc && provisionalDocs.has(project.ydoc);
}

// Make it globally accessible (to be accessed from ScrapboxFormatter.ts).
// The literal MODE comparison lets Rollup drop these assignments from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    window.appStore = store;
    window.generalStore = store; // For compatibility with TestHelpers
}

if (typeof window !== "undefined") {
    // Prepare a provisional project immediately after startup (yjsStore will replace it when the actual connection arrives)
    // This ensures tests and direct navigation work even before Yjs connection is established
    try {
        if (!store.project) {
            const parts = window.location.pathname.split("/").filter(Boolean).map(safeDecodeURIComponent);
            const title = parts[0] || "Untitled Project";
            const provisional = Project.createInstance(title);
            provisionalDocs.add(provisional.ydoc);
            (store as { project: Project; }).project = provisional;
            logger.debug("INIT: Provisional Project set in store.svelte.ts", { title });
        }
    } catch {
        // Ignore errors during initial project setup
    }
}

// NOTE: Projects are now created via HTTP seeding (SeedClient) for E2E tests,
// and loaded via loadProjectAndPage in +page.svelte for proper synchronization.
