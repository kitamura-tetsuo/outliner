declare module "yjs-orderedtree" {
    // Minimal type shim to satisfy TypeScript in this repo.
    // The library ships types under dist/types but package exports prevent resolution.
    // Provide only the members we actually use in the codebase.
    export class YTree {
        constructor(map?: any);
        generateNodeKey(): string;
        createNode(parentKey: string, key: string, value: any): void;
        setNodeOrderToEnd(key: string): void;
        setNodeBefore(key: string, targetKey: string): void;
        setNodeAfter(key: string, targetKey: string): void;
        getNodeChildrenFromKey(parentKey: string): string[];
        sortChildrenByOrder(children: string[], parentKey: string): string[];
        getNodeParentFromKey(key: string): string | undefined;
        deleteNodeAndDescendants(key: string): void;
        getNodeValueFromKey(key: string): any;
    }
}
