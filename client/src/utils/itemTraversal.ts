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
    const iterateUnordered = (items as any).iterateUnordered;
    if (typeof iterateUnordered === "function") {
        return {
            [Symbol.iterator]: () => iterateUnordered.call(items),
        };
    }

    // Support standard Iterables (e.g. native arrays, generators)
    if (typeof (items as any)[Symbol.iterator] === "function") {
        return items as Iterable<Item>;
    }

    // Support array-like objects with length and at() or index access
    const len = (items as any).length;
    if (typeof len === "number" && len >= 0) {
        const arr: Item[] = [];
        for (let i = 0; i < len; i++) {
            const v = typeof (items as any).at === "function"
                ? (items as any).at(i)
                : (items as any)[i];
            if (v !== undefined) {
                arr.push(v);
            }
        }
        return arr;
    }

    return [];
}
