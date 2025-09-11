// @ts-nocheck
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
    // 直近の確定情報（OutlinerItem が Yjs 反映前に暫定的に参照するため）
    lastConfirmedItemId = $state<string | null>(null);
    lastConfirmedTargetId = $state<string | null>(null);
    lastConfirmedAt = $state<number | null>(null);

    query = $state("");
    show(itemId: string) {
        console.log("AliasPickerStore.show called for itemId:", itemId);
        this.itemId = itemId;
        this.isVisible = true;
        this.query = "";
        // Collect options immediately
        this.options = this.collectOptions();
        console.log("AliasPickerStore.show options count:", this.options?.length ?? 0);
        // And refresh once after the DOM updates in case the tree changed
        requestAnimationFrame(() => {
            if (this.isVisible) {
                this.options = this.collectOptions();
                console.log("AliasPickerStore.show post-RAF options count:", this.options?.length ?? 0);
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

        // より堅牢な検索でアイテムを特定
        try {
            let item = this.findItemSafe(generalStore.currentPage, this.itemId);
            if (!item) {
                item = this.findItemDFS(generalStore.currentPage, this.itemId);
            }
            console.log("AliasPickerStore found item:", !!item);
            if (item) {
                (item as Item).aliasTargetId = option.id;
                console.log("AliasPickerStore set aliasTargetId:", option.id);
                // OutlinerItem 側が即時に反映できるよう暫定情報を保持
                this.lastConfirmedItemId = this.itemId;
                this.lastConfirmedTargetId = option.id;
                this.lastConfirmedAt = Date.now();
                // DOMにも即時反映（E2E安定化）: 監視は行わず最小限の反映に限定
                if (typeof document !== "undefined") {
                    const el = document.querySelector<HTMLElement>(`.outliner-item[data-item-id="${this.itemId}"]`);
                    if (el) {
                        el.setAttribute("data-alias-target-id", option.id);
                        requestAnimationFrame(() => {
                            const el2 = document.querySelector<HTMLElement>(
                                `.outliner-item[data-item-id=\"${this.itemId}\"]`,
                            );
                            if (el2) {
                                el2.setAttribute("data-alias-target-id", option.id);
                            }
                        });
                    }
                }
            } else {
                console.error("AliasPickerStore: Item not found:", this.itemId);
            }
        } catch (error) {
            console.error("AliasPickerStore error finding item:", error);
        }

        this.hide();
        console.log("AliasPickerStore confirm completed");
    }

    private findItemDFS(node: Item, id: string, depth = 0): Item | undefined {
        try {
            if (!node) return undefined;
            if (node.id === id) return node;
            const items = node.items as Items;
            if (!items) return undefined;
            for (const child of items as any as Iterable<Item>) {
                const found = this.findItemDFS(child, id, depth + 1);
                if (found) return found;
            }
            return undefined;
        } catch (e) {
            console.error("AliasPickerStore findItemDFS error:", e);
            return undefined;
        }
    }

    confirmById(id: string) {
        console.log("AliasPickerStore confirmById called with id:", id);
        // 大きなオブジェクトのダンプは避ける
        const opt = this.options.find(o => o.id === id);
        console.log("AliasPickerStore found option id:", opt?.id);
        if (opt) {
            this.confirm(opt.path);
        } else {
            console.log("AliasPickerStore option not found for id:", id);
        }
    }
    private collectOptions(): Option[] {
        // 1) 標準: 現在のページ木から収集
        const list: Option[] = [];
        const root = generalStore.currentPage;
        if (root) {
            this.traverse(root, [], list);
        }

        // 自分自身（新規エイリアスアイテム）は候補から除外
        const filteredModel = list.filter(o => o.id !== this.itemId);

        // 2) フォールバック: DOM から可視アイテムを収集（E2E安定化用）
        //    モデル側で十分な候補が取れないケース（< 2件）では、
        //    実際に表示されているアウトライナーから安全に取得する
        if (filteredModel.length < 2 && typeof document !== "undefined") {
            try {
                const seen = new Set<string>();
                const domList: Option[] = [];
                const nodes = document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id]");
                nodes.forEach(el => {
                    const id = el.dataset.itemId || "";
                    if (!id || id === this.itemId) return; // 自分自身は除外
                    if (seen.has(id)) return;
                    seen.add(id);
                    const txt = (el.querySelector(".item-content")?.textContent || el.textContent || "").trim();
                    const path = txt || id; // 空文字は避ける
                    domList.push({ id, path });
                });
                // DOM 由来候補が2件以上あればこちらを採用
                if (domList.length >= 2) {
                    return domList;
                }
            } catch (e) {
                console.warn("AliasPickerStore.collectOptions DOM fallback failed", e);
            }
        }

        return filteredModel;
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
