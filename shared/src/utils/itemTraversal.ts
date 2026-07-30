import type { Item } from "../app-schema.js";

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
    const itemsRecord = items as Record<string | symbol, unknown>;
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

/**
 * Iterates over an Item collection sequentially.
 * Uses standard Iterator or array-like access to preserve item order.
 *
 * @param items The item collection to iterate over
 * @returns An iterable of Items sequentially ordered
 */
export function iterateItemsOrdered(items: unknown): Iterable<Item> {
    if (!items) return [];

    const itemsRecord = items as Record<string | symbol, unknown>;

    // Support standard Iterables (e.g. native arrays, generators)
    // In our app-schema, Items implements Iterable with the correct sorting.
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

/**
 * Iterates over an Item collection deeply.
 * Performs a depth-first traversal of the item subtree using an explicit stack
 * to prevent maximum call stack size issues.
 *
 * @param items The item collection to iterate over deeply
 * @returns An iterable of Items including all descendants
 */
export function* iterateItemsDeep(items: unknown): Iterable<Item> {
    if (!items) return;

    const stack: Iterator<Item>[] = [];

    const rootIterable = iterateItems(items);
    if (!rootIterable) return;

    const rootIterator = Array.from(rootIterable)[Symbol.iterator]();
    if (!rootIterator) return;

    stack.push(rootIterator);

    while (stack.length > 0) {
        const iterator = stack[stack.length - 1];
        const result = iterator.next();

        if (result.done) {
            stack.pop();
        } else {
            const item = result.value;
            yield item;

            if (item && typeof item === "object") {
                let childItems: unknown = undefined;
                if ("items" in item && item.items) {
                    childItems = (item as any).items;
                } else if (typeof (item as any).get === "function") {
                    childItems = (item as any).get("items");
                }

                if (childItems) {
                    const childIterable = iterateItems(childItems);
                    if (childIterable) {
                        const childArr = Array.from(childIterable);
                        if (childArr.length > 0) {
                            stack.push(childArr[Symbol.iterator]());
                        }
                    }
                }
            }
        }
    }
}
