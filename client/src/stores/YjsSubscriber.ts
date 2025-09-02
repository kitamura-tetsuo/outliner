import { createSubscriber } from "svelte/reactivity";
import type * as Y from "yjs";

/**
 * Minimal subscriber for Yjs documents.
 * Triggers reactivity whenever the document updates.
 */
export class YjsSubscriber<R> {
    subscribe;

    constructor(
        private doc: Y.Doc,
        private getter: () => R,
        private setter?: (value: R) => void,
    ) {
        this.subscribe = createSubscriber(update => {
            const observer = () => update();
            this.doc.on("update", observer);
            return () => this.doc.off("update", observer);
        });
    }

    get current() {
        this.subscribe();
        return this.getter();
    }

    set current(value: R) {
        this.setter?.(value);
    }
}
