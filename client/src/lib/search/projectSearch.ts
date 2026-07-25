import type { Item, Items, Project } from "../../schema/app-schema";
import {
    type ItemMatch,
    replaceAll,
    replaceFirst,
    type ReplaceOptions,
    searchItems,
    type SearchOptions,
} from "./index";

export interface PageItemMatch<T> extends ItemMatch<T> {
    page: Item;
}

export function searchProject(
    project: Project,
    query: string,
    options: SearchOptions = {},
): Array<PageItemMatch<Item>> {
    const results: Array<PageItemMatch<Item>> = [];
    const pages = project.items as Items;
    for (const page of pages) {
        const matches = searchItems(page, query, options);
        for (const m of matches) {
            results.push({ ...m, page });
        }
    }
    return results;
}

/**
 * Every root passed to the replace helpers here is a page item, whose text is
 * the page title. Titles are skipped unless the caller opts in with
 * `skipRoot: false`, because renaming a page changes its URL and dangles every
 * incoming `[Page Title]` link.
 */
export function replaceFirstInProject(
    project: Project,
    query: string,
    replacement: string,
    options: ReplaceOptions = {},
): boolean {
    const pages = project.items as Items;
    const opts: ReplaceOptions = { skipRoot: true, ...options };
    for (const page of pages) {
        if (replaceFirst(page, query, replacement, opts)) {
            return true;
        }
    }
    return false;
}

/** See {@link replaceFirstInProject} for the page-title (`skipRoot`) default. */
export function replaceAllInProject(
    project: Project,
    query: string,
    replacement: string,
    options: ReplaceOptions = {},
): number {
    const pages = project.items as Items;
    const opts: ReplaceOptions = { skipRoot: true, ...options };
    let count = 0;
    for (const page of pages) {
        count += replaceAll(page, query, replacement, opts);
    }
    return count;
}
