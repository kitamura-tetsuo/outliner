// @ts-nocheck
import type { Item, Items, Project } from "@common/schema/app-schema";
import { type ItemMatch, replaceAll, replaceFirst, searchItems, type SearchOptions } from "@common/search";

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

export function replaceFirstInProject(
    project: Project,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): boolean {
    const pages = project.items as Items;
    for (const page of pages) {
        if (replaceFirst(page, query, replacement, options)) {
            return true;
        }
    }
    return false;
}

export function replaceAllInProject(
    project: Project,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): number {
    const pages = project.items as Items;
    let count = 0;
    for (const page of pages) {
        count += replaceAll(page, query, replacement, options);
    }
    return count;
}
