import {
    Tree,
    type TreeChangeEvents,
    type TreeNode,
} from "fluid-framework";
import { createSubscriber } from "svelte/reactivity";

export class TreeSubscriber<T extends TreeNode, R = T> {
    subscribe;
    private getter: () => R;

    constructor(
        node: T,
        eventName: keyof TreeChangeEvents,
        getter?: () => R,
        private setter?: (value: R) => void,
    ) {
        // 変換関数が指定されなければ、デフォルトでノードをそのまま返す
        this.getter = getter || (() => node as unknown as R);

        this.subscribe = createSubscriber(update => {
            // when the eventName event occurs, re-run any effects that read `this.current`
            const off = Tree.on(node, eventName, update);

            // stop listening when all the effects are destroyed
            return () => off();
        });
    }

    get current() {
        this.subscribe();

        // Return the transformed state, whether or not we're in an effect
        return this.getter();
    }

    set current(value: R) {
        this.setter?.(value);
    }
}
