// Local TypeScript macro shims for E2E typechecking only.
// Do not import anything from client/src here.

declare function $state<T>(value: T): T;
declare function $derived<T>(value: T): T;
declare function $effect(callback: () => void | (() => void)): void;
