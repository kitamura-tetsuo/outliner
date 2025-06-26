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
        if (!this.itemId) return;
        const option = this.options.find(o => o.path === targetPath);
        if (!option) return;
        const item = this.findItem(generalStore.currentPage!, this.itemId);
        if (item) {
            (item as any).aliasTargetId = option.id;
        }
        this.hide();
    }

    confirmById(id: string) {
        const opt = this.options.find(o => o.id === id);
        if (opt) {
            this.confirm(opt.path);
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
    private traverse(node: Item, path: string[], out: Option[]) {
        const current = [...path, node.text];
        out.push({ id: node.id, path: current.join("/") });
        const children = node.items as Items;
        if (children) {
            for (let i = 0; i < children.length; i++) {
                const child = children[i] as Item;
                this.traverse(child, current, out);
            }
        }
    }
    private findItem(node: Item, id: string): Item | undefined {
        if (node.id === id) return node;
        const items = node.items as Items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                const child = items[i] as Item;
                const found = this.findItem(child, id);
                if (found) return found;
            }
        }
        return undefined;
    }
}

export const aliasPickerStore = new AliasPickerStore();

if (typeof window !== "undefined") {
    (window as any).aliasPickerStore = aliasPickerStore;
}
