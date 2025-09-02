declare module "y-protocols/awareness" {
    export class Awareness {
        constructor(doc: any);
        getLocalState(): any;
        setLocalStateField(field: string, value: any): void;
    }
}
