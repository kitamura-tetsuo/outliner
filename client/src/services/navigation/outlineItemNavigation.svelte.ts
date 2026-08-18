// "Show me this outline item" — the one navigation primitive every feature
// that holds an item identity can call (#4982: double-clicking a calendar
// event; backlinks and search results are the obvious next callers).
//
// Four steps, in order, and each one is skipped when it is already true:
//
//   1. resolve the identity to a page + ancestor path (outlineItemLocation.ts,
//      from the project tree — never from rendered DOM, never by title);
//   2. route to the owning page through SvelteKit `goto` (AGENTS.md §2:
//      never the History API), *unless* that page is already open, in which
//      case nothing navigates and the open page is not re-resolved;
//   3. expand whatever ancestors are collapsed, through the outliner's own
//      view model rather than by touching DOM classes;
//   4. scroll the item into view and put the caret on it.
//
// Steps 3 and 4 have to wait for the destination page to actually render, and
// how long that takes is a Yjs sync question, not a fixed delay. So the wait
// is driven by DOM mutations (a MutationObserver, not a poll loop) with a
// deadline: each time the document changes, re-try the expand-and-find. If
// the deadline passes — the source was deleted, the page never loaded — the
// call reports `false` and leaves the user where they are. Nothing throws.

import { goto } from "$app/navigation";
import { page as pageStore } from "$app/stores";
import { get } from "svelte/store";
import { getLogger } from "../../lib/logger";
import { demoProjectFromPath, projectPagePath } from "../../lib/publicProject";
import type { Project } from "../../schema/app-schema";
import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../../stores/store.svelte";
import { escapeId } from "../../utils/domUtils";
import { resolvePath } from "../../utils/pathUtils";
import { type OutlineItemLocation, resolveOutlineItemLocation } from "./outlineItemLocation";

const logger = getLogger("outlineItemNavigation");

/** How long to keep waiting for the destination page to render the target item. */
const DEFAULT_REVEAL_TIMEOUT_MS = 8000;

/** Upper bound on one wait between expand-and-find attempts. */
const RECHECK_INTERVAL_MS = 250;

/**
 * Bumped whenever this module expands a branch. `OutlinerTree` recomputes its
 * display list from the view model on every change of this counter: the
 * expansion happens outside the component (collapse state lives in the view
 * model, which the component owns), so without an explicit signal the tree
 * would keep rendering the pre-expansion list.
 */
class OutlineRevealStore {
    expandVersion = $state(0);

    bumpExpandVersion(): void {
        this.expandVersion++;
    }
}

export const outlineRevealStore = new OutlineRevealStore();

export interface NavigateToOutlineItemOptions {
    /** Route segment naming the project; defaults to the demo slug in the current URL, else the project title. */
    projectName?: string;
    /** Overall budget for waiting on the destination page to render the item. */
    timeoutMs?: number;
}

/**
 * The segment a page URL of `project` starts with. A demo project is served
 * under its own slug rather than under its stored title, and the slug is only
 * knowable from where the viewer currently is — the same rule `SearchPanel`
 * follows when it jumps to a match.
 */
function routeProjectName(project: Project): string {
    const pathname = get(pageStore)?.url?.pathname ?? "";
    return demoProjectFromPath(pathname) ?? project.title;
}

/** True when `itemKey` names a live outline item of `project`. */
export function isOutlineItemAddressable(project: Project | undefined, itemKey: string | undefined): boolean {
    return resolveOutlineItemLocation(project, itemKey) !== undefined;
}

/** Clear the collapsed flag on every ancestor that still carries one. */
function expandAncestors(location: OutlineItemLocation): void {
    const viewModel = generalStore.activeViewModel;
    if (!viewModel) return;
    let expanded = false;
    for (const ancestorId of location.ancestorIds) {
        if (!viewModel.isCollapsed(ancestorId)) continue;
        viewModel.toggleCollapsed(ancestorId);
        expanded = true;
    }
    if (expanded) outlineRevealStore.bumpExpandVersion();
}

function findItemElement(itemId: string): HTMLElement | undefined {
    if (typeof document === "undefined") return undefined;
    return document.querySelector<HTMLElement>(`[data-item-id="${escapeId(itemId)}"]`) ?? undefined;
}

/** Resolve on the next DOM mutation, or after `timeoutMs`, whichever comes first. */
function waitForDocumentChange(timeoutMs: number): Promise<void> {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
        return new Promise((resolve) => setTimeout(resolve, timeoutMs));
    }
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            clearTimeout(timer);
            resolve();
        };
        const observer = new MutationObserver(finish);
        const timer = setTimeout(finish, timeoutMs);
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

/**
 * Expand, scroll and focus, waiting for the page to render the item first.
 * Returns false when it never appeared inside the budget.
 */
async function revealOutlineItem(location: OutlineItemLocation, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    expandAncestors(location);
    let element = findItemElement(location.itemId);
    while (!element) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        // The mutation is the wake-up; the cap only bounds one iteration, so a
        // step that changes no DOM at all (the destination tree mounting its
        // view model before it renders anything of this branch) still gets
        // re-checked instead of stalling until the whole budget expires.
        await waitForDocumentChange(Math.min(remaining, RECHECK_INTERVAL_MS));
        expandAncestors(location);
        element = findItemElement(location.itemId);
    }

    element.scrollIntoView({ block: "center", inline: "nearest" });
    editorOverlayStore.setActiveItem(location.itemId);
    editorOverlayStore.setCursor({ itemId: location.itemId, offset: 0, isActive: true, userId: "local" });
    return true;
}

/**
 * Navigate to the outline item `itemKey` names and bring it into view.
 *
 * Returns false — without throwing and without leaving the current page —
 * when the identity resolves to nothing (a row that is not an outline item, a
 * concurrently deleted source) or when the destination never rendered it.
 */
export async function navigateToOutlineItem(
    project: Project | undefined,
    itemKey: string | undefined,
    options: NavigateToOutlineItemOptions = {},
): Promise<boolean> {
    if (!project) return false;
    const location = resolveOutlineItemLocation(project, itemKey);
    if (!location) return false;

    try {
        // Identity, not title: a rename of the open page must not read as
        // "some other page is open".
        const alreadyOpen = generalStore.currentPage?.key === location.pageKey;
        if (!alreadyOpen) {
            const projectName = options.projectName ?? routeProjectName(project);
            if (!projectName) return false;
            await goto(resolvePath(projectPagePath(projectName, location.pageTitle)));
        }
        return await revealOutlineItem(location, options.timeoutMs ?? DEFAULT_REVEAL_TIMEOUT_MS);
    } catch (err) {
        logger.warn({ err, itemKey }, "Failed to navigate to outline item");
        return false;
    }
}
