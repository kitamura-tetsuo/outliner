// @ts-nocheck
import type { Item, Items, Project } from "../../schema/app-schema";
import { type ItemMatch, replaceAll, replaceFirst, searchItems, type SearchOptions } from "./index";

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

    console.log(
        `[replaceAllInProject] Starting project-wide replacement: query="${query}", replacement="${replacement}"`,
    );
    console.log(`[replaceAllInProject] Project has ${pages.length} pages`);

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        console.log(
            `[replaceAllInProject] Processing page ${i + 1}/${pages.length}: id=${page.id}, text="${page.text}"`,
        );

        try {
            const pageReplacements = replaceAll(page, query, replacement, options);
            console.log(`[replaceAllInProject] Page ${page.id} replacements: ${pageReplacements}`);
            count += pageReplacements;
        } catch (error) {
            console.error(`[replaceAllInProject] Error processing page ${page.id}:`, error);
        }
    }

    console.log(`[replaceAllInProject] Completed project-wide replacement: total replacements=${count}`);
    return count;
}
