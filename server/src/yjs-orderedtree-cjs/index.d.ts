import * as Y from "yjs";

export function checkForYTree(yMap: Y.Map<any>): boolean;

export class YTree {
    constructor(yMap: Y.Map<any>);
    generateNodeKey(): string;
    observe(callback: () => void): void;
    unobserve(callback: () => void): void;
    getYMap(): Y.Map<any>;
    setNodeValueFromKey(key: string, value: any): void;
    getNodeValueFromKey(key: string): any;
    getNodeChildrenFromKey(key: string): string[];
    getNodeParentFromKey(key: string): string;
    createNode(parentKey: string, nodeKey: string, value: any): void;
    deleteNodeAndDescendants(key: string): void;
    moveChildToParent(childKey: string, parentKey: string): void;
    recomputeParentsAndChildren(): void;
    getAllDescendants(key: string, descendants: string[]): void;
    isNodeUnderOtherNode(node: any, other: any): boolean;
    setNodeOrderToStart(nodeKey: string): void;
    setNodeOrderToEnd(nodeKey: string): void;
    setNodeAfter(nodeKey: string, target: string): void;
    setNodeBefore(nodeKey: string, target: string): void;
    sortChildrenByOrder(children: string[], parentKey: string): string[];
    getNextOrderIndex(key: string, children: string[], parentKey: string): string;
    getPreviousOrderIndex(key: string, children: string[], parentKey: string): string;
}
