declare module "yjs-orderedtree" {
    import * as Y from "yjs";

    export class OrderedTree {
        constructor(doc: Y.Doc, map: Y.Map<any>);
        // Add other methods as needed based on usage
        observe(callback: (event: any) => void): void;
        observeDeep(callback: (event: any) => void): void;
    }
}
