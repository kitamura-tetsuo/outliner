import { type TreeNode, type TreeChangeEvents, Tree } from "fluid-framework";
import { createSubscriber } from "svelte/reactivity";



export class TreeSubscriber<T extends TreeNode> {
    subscribe;

    constructor(private node: T, eventName: keyof TreeChangeEvents) {
        this.subscribe = createSubscriber((update) => {
            // when the eventName event occurs, re-run any effects that read `this.current`
            const off = Tree.on(this.node, eventName, update);

            // stop listening when all the effects are destroyed
            return () => off();
        });
    }

    get current() {
        this.subscribe();

        // Return the current state of the query, whether or not we're in an effect
        return this.node;
    }
}
