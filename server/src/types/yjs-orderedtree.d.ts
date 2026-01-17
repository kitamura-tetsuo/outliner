declare module "yjs-orderedtree" {
    import * as Y from "yjs";

    export class YTree {
        constructor(map: Y.Map<any>);
        generateNodeKey(): string;
        createNode(parentKey: string, nodeKey: string, value: any): void;
        setNodeOrderToEnd(nodeKey: string): void;
        setNodeBefore(nodeKey: string, beforeKey: string): void;
        setNodeAfter(nodeKey: string, afterKey: string): void;
        getNodeValueFromKey(key: string): any;
        getNodeParentFromKey(key: string): string | null;
        getNodeChildrenFromKey(key: string): string[];
        sortChildrenByOrder(children: string[], parentKey: string): string[];
        deleteNodeAndDescendants(key: string): void;
    }
}
