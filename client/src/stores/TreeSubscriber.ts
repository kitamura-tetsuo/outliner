import { createSubscriber } from "svelte/reactivity";
import * as Y from "yjs";

/**
 * Yjsベースの汎用サブスクライバ。
 * 既存API互換のため eventName は受け取るが無視する。
 *
 * - node が Y.Doc を内包している場合 (node.ydoc) は doc.update に反応
 * - node が Y.Text の場合は text.observe に反応
 * - node が Y.Map / Y.Array の場合は observeDeep に反応
 * - 上記が取得できない場合は no-op
 */
export class TreeSubscriber<T, R = T> {
    subscribe: () => void;

    constructor(
        private node: T,
        // 互換用: Fluid のイベント名。Yjs では使用しない
        // biome-ignore lint/suspicious/noExplicitAny: 互換のため any
        _eventName: any,
        private getter: () => R = () => node as unknown as R,
        private setter?: (value: R) => void,
    ) {
        this.subscribe = createSubscriber((update) => {
            const cleanups: Array<() => void> = [];

            const n: any = this.node as any;

            // 0) YTree（Items/Itemが保持）を監視
            const ytree: any = n?.tree;
            if (ytree?.observe && ytree?.unobserve) {
                const onTree = () => update();
                ytree.observe(onTree);
                cleanups.push(() => ytree.unobserve(onTree));
            }

            // 1) Y.Doc 監視（node.ydoc または node.tree.ydoc）
            const doc: Y.Doc | undefined = n?.ydoc instanceof Y.Doc
                ? (n.ydoc as Y.Doc)
                : n instanceof Y.Doc
                ? (n as Y.Doc)
                : n?.tree?.ydoc instanceof Y.Doc
                ? (n.tree.ydoc as Y.Doc)
                : undefined;
            if (doc) {
                const listener = () => update();
                doc.on("update", listener);
                cleanups.push(() => doc.off("update", listener));
            }

            // 2) Yjs プリミティブ監視
            if (n instanceof Y.Text) {
                const listener = () => update();
                n.observe(listener);
                cleanups.push(() => n.unobserve(listener));
            } else if (n instanceof Y.Map || n instanceof Y.Array) {
                const listener = () => update();
                n.observeDeep(listener);
                cleanups.push(() => n.unobserveDeep(listener));
            } else if (n?.value?.get) {
                const t: Y.Text | undefined = n.value.get("text");
                if (t && t instanceof Y.Text) {
                    const listener = () => update();
                    t.observe(listener);
                    cleanups.push(() => t.unobserve(listener));
                }
            }

            // 監視解除
            return () => {
                for (const fn of cleanups) fn();
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
