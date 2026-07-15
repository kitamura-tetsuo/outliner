<script lang="ts">
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import { getLogger } from "../lib/logger";

const logger = getLogger("OutlinerItemAliasSegment");

interface Props {
    item: Item;
}

let { item }: Props = $props();

let textString = $state<string>("");

function hasTreeKey(i: unknown): i is { tree: any; key: string } {
    return !!i && typeof (i as any).key === 'string' && !!(i as any).tree;
}

let unsubs: Array<() => void> = [];

function setupSubscription(currentItem: Item) {
    unsubs.forEach(u => u());
    unsubs = [];

    try {
        if (hasTreeKey(currentItem)) {
            const tree = currentItem.tree;
            const key = currentItem.key;
            const m = tree?.getNodeValueFromKey?.(key) as { get?: (k: string) => unknown } | undefined;
            const t = m?.get?.("text") as { observe?: (f: () => void) => void, unobserve?: (f: () => void) => void, toString?: () => string } | undefined;

            if (t && typeof t.observe === "function") {
                const h1 = () => {
                    if (t && typeof t.toString === "function") {
                        try {
                            textString = t.toString() ?? "";
                        } catch (e) {
                            logger.warn({ err: e }, "[OutlinerItemAliasSegment] toString error");
                            textString = "";
                        }
                    } else {
                        textString = "";
                    }
                };
                t.observe(h1);
                unsubs.push(() => { try { t.unobserve?.(h1); } catch {} });
                h1(); // Initial reflection
            } else {
                textString = (currentItem as Item).text || "";
            }
        } else {
            textString = (currentItem as Item).text || "";
        }
    } catch (e) {
        logger.warn({ err: e }, "[OutlinerItemAliasSegment] setupSubscription error");
        textString = (currentItem as Item).text || "";
    }
}

$effect(() => {
    setupSubscription(item);
    return () => {
        unsubs.forEach(u => u());
        unsubs = [];
    };
});
</script>

<span>{textString || "Loading..."}</span>
