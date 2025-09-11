// Local TypeScript macro shims for E2E typechecking only.
// This makes $state/$derived/$effect available as globals during E2E tsc.
// Do not import anything from client/src here.

declare function $state<T>(value: T): T;
declare function $derived<T>(value: T): T;
declare function $effect(callback: () => void | (() => void)): void;
