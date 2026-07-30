// Candidate INSERT destinations for the calendar's "new entry" flow (#4349).
//
// A new calendar entry is always a new outline item, and there is no
// implicit inbox — the destination is a page, chosen explicitly. (A picker
// for an arbitrary nested parent is a reasonable follow-up; scoping to pages
// keeps the destination a single, always-visible choice, and a page is
// itself a valid `parentKey` — new items are created as its direct children,
// exactly as `PageList.svelte`'s own "new page" flow treats a page.)

import type { Project } from "$shared/app-schema";
import { iterateItems } from "$shared/utils/itemTraversal";
import type { CalendarDestinationHistoryEntry } from "./calendarDestinationHistory";

/** Every page (top-level item) of the project, as a candidate INSERT destination. */
export function listDestinationCandidates(project: Project): CalendarDestinationHistoryEntry[] {
    const candidates: CalendarDestinationHistoryEntry[] = [];
    for (const page of iterateItems(project.items)) {
        candidates.push({ parentKey: page.key, label: page.text.trim() || "(untitled)" });
    }
    return candidates;
}

/** Whether `parentKey` still names an existing node in `project`'s tree. */
export function isDestinationResolvable(project: Project, parentKey: string): boolean {
    const tree = project.tree as unknown as {
        hasNode?: (key: string) => boolean;
        computedMap?: Map<string, unknown>;
    };
    if (typeof tree.hasNode === "function") return tree.hasNode(parentKey);
    if (tree.computedMap) return tree.computedMap.has(parentKey);
    try {
        project.tree.getNodeValueFromKey(parentKey);
        return true;
    } catch (_e) {
        return false;
    }
}
