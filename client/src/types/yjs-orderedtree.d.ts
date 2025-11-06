// This declaration file ensures TypeScript recognizes yjs-orderedtree types
// The library has types but they're not properly exposed via package.json exports

declare module "yjs-orderedtree" {
    export class YTree {
        constructor(yMap?: import("yjs").Map<unknown>);
        deleteNodeAndDescendants(key: string): void;
        getNodeChildrenFromKey(key: string): string[];
        getNodeParentFromKey(key: string): string | undefined;
        getNodeValueFromKey(key: string): unknown;
        sortChildrenByOrder(children: string[], parentKey: string): string[];
        generateNodeKey(): string;
        createNode(parentKey: string, childKey: string, value: import("yjs").Map<unknown>): void;
        setNodeOrderToEnd(key: string): void;
        setNodeBefore(key: string, target: string): void;
        setNodeAfter(key: string, target: string): void;
    }
}
