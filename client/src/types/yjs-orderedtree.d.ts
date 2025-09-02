declare module "yjs-orderedtree" {
    import type { Map as YMap } from "yjs";

    export class YTree {
        constructor(map: YMap<any>);
        generateNodeKey(): string;
        createNode(parentKey: string, key: string, value: any): void;
        setNodeAfter(key: string, afterKey: string): void;
        getNodeChildrenFromKey(parentKey: string): string[];
        sortChildrenByOrder(childrenKeys: string[], parentKey: string): string[];
        getNodeValueFromKey(key: string): any;
        setNodeValueFromKey(key: string, value: any): void;
        moveChildToParent(key: string, newParentKey: string): void;
        deleteNodeAndDescendants(key: string): void;
        getNodeParentFromKey(key: string): string;
    }

    export function checkForYTree(map: YMap<any>): boolean;
}
