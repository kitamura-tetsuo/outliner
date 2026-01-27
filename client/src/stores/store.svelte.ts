// Store singleton instance
import { SvelteMap } from "svelte/reactivity";
import { type Cursor } from "../lib/Cursor";
import { type Item, type Project } from "../schema/app-schema";

export interface TextAreaPosition {
    top: number;
    left: number;
    height: number;
}

export class Store {
    // Current project
    project = $state<Project | null>(null);
    currentPage = $state<Item | null>(null);

    // Pages management
    pages = $derived.by(() => {
        const items = this.project?.items;
        if (!items) return { current: [] };
        // Items behaves like an array via the Proxy wrapper in app-schema.ts
        return { current: items as any };
    });
    pagesVersion = $state(0);

    // Global textarea reference
    private _textareaRef: HTMLTextAreaElement | null = null;

    // IME composition state
    isComposing = $state(false);

    // Cursors (managed by ID? or single local cursor?)
    // Note: Remote cursors are in PresenceStore
    private _cursors = new SvelteMap<string, Cursor>();

    setTextareaRef(ref: HTMLTextAreaElement | null) {
        this._textareaRef = ref;
    }

    setIsComposing(isComposing: boolean) {
        this.isComposing = isComposing;
    }

    getCursorInstances(): Cursor[] {
        return Array.from(this._cursors.values());
    }

    startCursorBlink() {
        // Implementation needed (or delegate to EditorOverlayStore)
    }

    getActiveItem(): string | null {
        // Delegate to EditorOverlayStore or manage here
        return null;
    }
}

export const store = new Store();
