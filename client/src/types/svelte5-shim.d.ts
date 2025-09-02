// TypeScript macro shims for Svelte 5 $state/$derived/$effect used only for type-checking in tests.
// These declarations have no runtime effect.

declare function $state<T>(value: T): T;
declare function $derived<T>(value: T): T;
declare function $effect(callback: () => void | (() => void)): void;
