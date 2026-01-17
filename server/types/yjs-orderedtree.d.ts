declare module "yjs-orderedtree" {
    export class YTree {
        constructor(ymap: any);
        generateNodeKey(): string;
        createNode(parentKey: string, nodeKey: string, value: any): void;
        getNodeValueFromKey(key: string): any;
        getNodeParentFromKey(key: string): string | null;
        getNodeChildrenFromKey(key: string): string[];
        sortChildrenByOrder(children: string[], parentKey: string): string[];
        deleteNodeAndDescendants(key: string): void;
        setNodeOrderToEnd(nodeKey: string): void;
        setNodeBefore(nodeKey: string, siblingKey: string): void;
        setNodeOrderToEnd(nodeKey: string): void;
        setNodeAfter(nodeKey: string, siblingKey: string): void;
    }
    export class OrderedTree extends YTree {}
    export class OrderedTreeItem {}
}
