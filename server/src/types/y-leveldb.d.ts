declare module "y-leveldb" {
    import type * as Y from "yjs";

    export class LeveldbPersistence {
        constructor(location: string, opts?: { Level?: any; levelOptions?: object; });
        tr: Promise<any>;
        getYDoc(docName: string): Promise<import("yjs").Doc>;
        storeUpdate(docName: string, update: Uint8Array): Promise<number>;
        getStateVector(docName: string): Promise<Uint8Array>;
        getDiff(docName: string, stateVector: Uint8Array): Promise<Uint8Array>;
        clearDocument(docName: string): Promise<void>;
        setMeta(docName: string, metaKey: string, value: any): Promise<void>;
        getMeta(docName: string, metaKey: string): Promise<any>;
        delMeta(docName: string, metaKey: string): Promise<any>;
        getAllDocNames(): Promise<string[]>;
        getAllDocStateVectors(): Promise<Array<{ name: string; sv: Uint8Array; clock: number; }>>;
        getMetas(docName: string): Promise<Map<string, any>>;
        destroy(): Promise<void>;
        clearAll(): Promise<any>;
        flushDocument(docName: string): Promise<void>;
    }
}
