declare module "y-protocols/awareness" {
    export class Awareness {
        constructor(doc: Y.Doc);
        getLocalState(): Record<string, unknown> | null;
        setLocalState(state: Record<string, unknown> | null): void;
        setLocalStateField(field: string, value: unknown): void;
        on(event: string, cb: (...args: unknown[]) => void): void;
        off(event: string, cb: (...args: unknown[]) => void): void;
        getStates(): Map<number, Record<string, unknown>>;
    }
    export function encodeAwarenessUpdate(awareness: Awareness, clients: number[]): Uint8Array;
    export function applyAwarenessUpdate(awareness: Awareness, update: Uint8Array, origin: unknown): void;
}
