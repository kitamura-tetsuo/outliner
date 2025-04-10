import {
    Tree,
    type TreeChangeEvents,
    type TreeNode,
} from "fluid-framework";
import { createSubscriber } from "svelte/reactivity";

export class TreeSubscriber<T extends TreeNode, R = T> {
    subscribe;
    private transform: () => R;

    constructor(
        node: T,
        eventName: keyof TreeChangeEvents,
        transform?: () => R,
    ) {
        // 変換関数が指定されなければ、デフォルトでノードをそのまま返す
        this.transform = transform || (() => node as unknown as R);

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
        return this.transform();
    }
}
