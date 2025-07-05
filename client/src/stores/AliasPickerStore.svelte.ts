import type { Item, Items } from "../schema/app-schema";
import { store as generalStore } from "./store.svelte";

interface Option {
    id: string;
    path: string;
}

class AliasPickerStore {
    isVisible = $state(false);
    itemId = $state<string | null>(null);
    options = $state<Option[]>([]);
    query = $state("");
    show(itemId: string) {
        this.itemId = itemId;
        this.isVisible = true;
        this.query = "";
        // Collect options immediately
        this.options = this.collectOptions();
        // And refresh once after the DOM updates in case the tree changed
        requestAnimationFrame(() => {
            if (this.isVisible) {
                this.options = this.collectOptions();
            }
        });
    }
    hide() {
        this.isVisible = false;
        this.itemId = null;
        this.options = [];
        this.query = "";
    }
    confirm(targetPath: string) {
        console.log("AliasPickerStore confirm called with targetPath:", targetPath);
        console.log("AliasPickerStore itemId:", this.itemId);
        console.log("AliasPickerStore currentPage exists:", !!generalStore.currentPage);

        // 入力検証
        if (!this.itemId) {
            console.warn("AliasPickerStore: No itemId provided");
            this.hide();
            return;
        }

        if (!generalStore.currentPage) {
            console.error("AliasPickerStore: No current page available");
            this.hide();
            return;
        }

        const option = this.options.find(o => o.path === targetPath);
        console.log("AliasPickerStore found option for path:", option);
        if (!option) {
            console.warn("AliasPickerStore: No option found for path:", targetPath);
            this.hide();
            return;
        }

        // 自己参照チェック
        if (option.id === this.itemId) {
            console.warn("AliasPickerStore: Cannot create alias to self");
            this.hide();
            return;
        }

        // findItemの代わりに、より安全な方法でアイテムを検索
        try {
            const item = this.findItemSafe(generalStore.currentPage, this.itemId);
            console.log("AliasPickerStore found item:", !!item);
            if (item) {
                (item as any).aliasTargetId = option.id;
                console.log("AliasPickerStore set aliasTargetId:", option.id);
            } else {
                console.error("AliasPickerStore: Item not found:", this.itemId);
            }
        } catch (error) {
            console.error("AliasPickerStore error finding item:", error);
        }

        this.hide();
        console.log("AliasPickerStore confirm completed");
    }

    confirmById(id: string) {
        console.log("AliasPickerStore confirmById called with id:", id);
        console.log("AliasPickerStore options:", this.options);
        const opt = this.options.find(o => o.id === id);
        console.log("AliasPickerStore found option:", opt);
        if (opt) {
            this.confirm(opt.path);
        } else {
            console.log("AliasPickerStore option not found for id:", id);
        }
    }
    private collectOptions(): Option[] {
        const list: Option[] = [];
        const root = generalStore.currentPage;
        if (root) {
            this.traverse(root, [], list);
        }
        return list;
    }
    private traverse(node: Item, path: string[], out: Option[], visited = new Set<string>(), depth = 0) {
        // 無限ループ対策
        if (depth > 100 || visited.has(node.id)) {
            console.warn(
                `AliasPickerStore traverse: Skipping node ${node.id} (depth: ${depth}, visited: ${
                    visited.has(node.id)
                })`,
            );
            return;
        }

        visited.add(node.id);
        const current = [...path, node.text];
        out.push({ id: node.id, path: current.join("/") });

        const children = node.items as Items;
        if (children) {
            for (let i = 0; i < children.length; i++) {
                const child = children[i] as Item;
                if (child && !visited.has(child.id)) {
                    this.traverse(child, current, out, visited, depth + 1);
                }
            }
        }

        visited.delete(node.id); // バックトラッキング時に削除
    }
    private findItemSafe(node: Item, id: string): Item | undefined {
        // 非再帰的な幅優先探索を使用して無限ループを回避
        const queue: Item[] = [node];
        const visited = new Set<string>();
        let iterations = 0;
        const maxIterations = 1000; // 安全のための上限

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const current = queue.shift()!;

            // 既に訪問済みのノードはスキップ
            if (visited.has(current.id)) {
                continue;
            }
            visited.add(current.id);

            if (current.id === id) {
                return current;
            }

            const items = current.items as Items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const child = items[i] as Item;
                    if (child && !visited.has(child.id)) {
                        queue.push(child);
                    }
                }
            }
        }

        if (iterations >= maxIterations) {
            console.error("AliasPickerStore findItemSafe: Maximum iterations exceeded");
        }

        return undefined;
    }

    private findItem(node: Item, id: string, depth = 0): Item | undefined {
        console.log(`AliasPickerStore findItem depth ${depth}: searching for ${id} in node ${node.id}`);

        if (depth > 100) {
            console.error("AliasPickerStore findItem: Maximum depth exceeded, possible infinite loop");
            return undefined;
        }

        if (node.id === id) {
            console.log(`AliasPickerStore findItem: Found item at depth ${depth}`);
            return node;
        }

        const items = node.items as Items;
        if (items) {
            console.log(`AliasPickerStore findItem depth ${depth}: checking ${items.length} children`);
            for (let i = 0; i < items.length; i++) {
                const child = items[i] as Item;
                if (child) {
                    const found = this.findItem(child, id, depth + 1);
                    if (found) return found;
                }
            }
        }

        console.log(`AliasPickerStore findItem depth ${depth}: not found in this branch`);
        return undefined;
    }
}

export const aliasPickerStore = new AliasPickerStore();

if (typeof window !== "undefined") {
    (window as any).aliasPickerStore = aliasPickerStore;
}
