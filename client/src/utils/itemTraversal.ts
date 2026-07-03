import type { Item } from "../schema/app-schema";

/**
 * Iterates over an Item collection efficiently.
 * Uses `iterateUnordered` if available to avoid O(N log N) sorting costs,
 * falling back to default iteration or array-like access.
 *
 * @param items The item collection to iterate over
 * @returns An iterable of Items
 */
export function iterateItems(items: unknown): Iterable<Item> {
    if (!items) return [];

    // Prioritize iterateUnordered for O(N) traversal
    const itemsRecord = items as Record<string, unknown>;
    const iterateUnordered = itemsRecord.iterateUnordered;
    if (typeof iterateUnordered === "function") {
        return {
            [Symbol.iterator]: () => iterateUnordered.call(items) as Iterator<Item>,
        };
    }

    // Support standard Iterables (e.g. native arrays, generators)
    if (typeof (items as Iterable<unknown>)[Symbol.iterator] === "function") {
        return items as Iterable<Item>;
    }

    // Support array-like objects with length and at() or index access
    const len = itemsRecord.length;
    if (typeof len === "number" && len >= 0) {
        const arr: Item[] = [];
        for (let i = 0; i < len; i++) {
            const v = typeof itemsRecord.at === "function"
                ? itemsRecord.at(i)
                : (items as Record<number, unknown>)[i];
            if (v !== undefined) {
                arr.push(v as Item);
            }
        }
        return arr;
    }

    return [];
}
