import { getLogger } from "../lib/logger";
const logger = getLogger("pageUtils");

import type { Item } from "../schema/app-schema";
import { iterateItems } from "./itemTraversal";
import { safeDecodeURIComponent } from "./urlUtils";

export function generateDefaultPageTitle(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `New Page ${dateStr} ${timeStr}`;
}

function readItemText(item: Item | undefined | null): string {
    if (!item) return "";
    try {
        if (typeof item.text?.toString === "function") {
            return item.text.toString();
        }
        return String(item.text ?? "");
    } catch (_e) {
        // Ignore error and treat the item as untitled
        return "";
    }
}

/**
 * Every spelling of a route's page segment that a page title may match: the raw
 * parameter and its decoded form, both trimmed and case-folded.
 */
function routeNameVariants(name: string): string[] {
    const raw = String(name).trim().toLowerCase();
    const variants = [raw, String(safeDecodeURIComponent(name)).trim().toLowerCase()];
    try {
        variants.push(decodeURIComponent(String(name).trim()).toLowerCase());
    } catch (_e) {
        logger.error(_e);
    }
    return variants;
}

/**
 * True when `item`'s current title is the page the route segment `name` names.
 *
 * Routes derive their page segment from a page title, so renaming the open page
 * changes the URL without changing which page is open. Both the demo route and
 * the authenticated route need to tell that apart from navigation to a
 * different page, and both must accept the encoded segment `goto()` produced.
 */
export function isPageNamed(item: Item | undefined | null, name: string): boolean {
    if (!item || !name) return false;
    const currentName = readItemText(item).trim().toLowerCase();
    if (!currentName) return false;
    return routeNameVariants(name).includes(currentName);
}

/**
 * The page whose identity is `key`, regardless of its current title.
 *
 * Renaming a page changes what `findPageByName` answers to but not which pages
 * exist, so callers that must tell "this page was retitled" from "this page is
 * gone" look it up by identity instead of by name.
 */
export function findPageByKey(items: Iterable<Item> | undefined | null, key: string | undefined): Item | undefined {
    if (!items || !key) return undefined;

    for (const p of iterateItems(items) as Iterable<Item>) {
        if (!p) continue;
        if (p.key === key || p.id === key) return p;
    }

    return undefined;
}

export function findPageByName(items: Iterable<Item> | undefined | null, name: string): Item | null {
    if (!items) return null;

    const targetNames = routeNameVariants(name);

    for (const p of iterateItems(items) as Iterable<Item>) {
        if (!p) continue;

        const currentName = readItemText(p).trim().toLowerCase();

        if (targetNames.includes(currentName)) {
            return p;
        }
    }

    return null;
}

export function allocatePageTitle(
    items: Iterable<Item> | undefined | null,
    rawTitle: string,
    currentItemId?: string,
): string {
    const trimmedTitle = rawTitle.trim();
    const baseTitle = trimmedTitle === "" ? "Untitled" : trimmedTitle;

    if (!items) return baseTitle;

    const existingNames = new Set<string>();
    for (const p of iterateItems(items) as Iterable<Item>) {
        if (!p || (currentItemId && (p.id === currentItemId || p.key === currentItemId))) continue;
        existingNames.add(readItemText(p).trim().toLowerCase());
    }

    let allocatedTitle = baseTitle;
    let counter = 2;
    while (existingNames.has(allocatedTitle.toLowerCase())) {
        allocatedTitle = `${baseTitle}_${counter}`;
        counter++;
    }

    return allocatedTitle;
}
