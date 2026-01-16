declare module "y-leveldb" {
    import * as Y from "yjs";

    export class LeveldbPersistence {
        constructor(path: string);
        tr: Promise<void>;
        getYDoc(room: string): Promise<Y.Doc>;
        getAllDocNames(): Promise<string[]>;
    }
}
