declare module "yjs-orderedtree" {
    // Minimal type shim to satisfy TypeScript in this repo.
    // The library ships types under dist/types but package exports prevent resolution.
    // We only need the symbol names; detailed typing is not required for our usage.
    export class YTree {
        constructor(ymap?: any);
        deleteNodeAndDescendants(key: string): void;
        getNodeChildrenFromKey(key: string): string[];
        getNodeParentFromKey(key: string): string | undefined;
        getNodeValueFromKey(key: string): unknown;
        sortChildrenByOrder(children: string[], parentKey: string): string[];
        generateNodeKey(): string;
        createNode(parentKey: string, childKey: string, value: any): void;
        setNodeOrderToEnd(key: string): void;
        setNodeBefore(key: string, target: string): void;
        setNodeAfter(key: string, target: string): void;
    }
}
