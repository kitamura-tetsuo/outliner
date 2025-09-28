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
            const emit = (src: string) => {
                try {
                    if (typeof window !== "undefined") {
                        try {
                            console.debug("[YjsSubscriber] emit", src);
                        } catch {}
                        const ev = new CustomEvent("yjs-doc-updated", { detail: { src } });
                        window.dispatchEvent(ev);
                    }
                    update();
                } catch {}
            };
            const observer = () => emit("update");
            const observerV2 = () => emit("updateV2");
            const afterTxn = () => emit("afterTransaction");
            try {
                this.doc.on("update", observer);
            } catch {}
            try {
                (this.doc as any).on?.("updateV2", observerV2);
            } catch {}
            try {
                (this.doc as any).on?.("afterTransaction", afterTxn);
            } catch {}
            return () => {
                try {
                    this.doc.off("update", observer);
                } catch {}
                try {
                    (this.doc as any).off?.("updateV2", observerV2);
                } catch {}
                try {
                    (this.doc as any).off?.("afterTransaction", afterTxn);
                } catch {}
            };
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
