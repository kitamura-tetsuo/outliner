import type { Item } from "../schema/app-schema";

export interface ArrayLikeItems {
    length: number;
    at(idx: number): Item | undefined;
    toArray?(): unknown[];
}

export interface ArrayLikeUnknown {
    length?: number;
    at?(idx: number): unknown;
    toArray?(): unknown[];
    [key: number]: unknown;
}

export interface YjsObservableDeep {
    observeDeep(f: (events: unknown[], transaction: unknown) => void): void;
    unobserveDeep(f: (events: unknown[], transaction: unknown) => void): void;
}

export interface YjsObservable {
    observe(f: (event: unknown, transaction: unknown) => void): void;
    unobserve(f: (event: unknown, transaction: unknown) => void): void;
}

export function isArrayLikeItems(obj: unknown): obj is ArrayLikeItems {
    return (
        typeof obj === "object"
        && obj !== null
        && "length" in obj
        && typeof (obj as ArrayLikeItems).length === "number"
        && "at" in obj
        && typeof (obj as ArrayLikeItems).at === "function"
    );
}

export function isArrayLikeUnknown(obj: unknown): obj is ArrayLikeUnknown {
    return (
        typeof obj === "object"
        && obj !== null
        && ("length" in obj || "at" in obj || "toArray" in obj)
    );
}

export function isYjsObservableDeep(obj: unknown): obj is YjsObservableDeep {
    return (
        typeof obj === "object"
        && obj !== null
        && "observeDeep" in obj
        && "unobserveDeep" in obj
    );
}

export function isYjsObservable(obj: unknown): obj is YjsObservable {
    return (
        typeof obj === "object"
        && obj !== null
        && "observe" in obj
        && "unobserve" in obj
    );
}
