// Type-only shims for Svelte 5 runes to keep TypeScript happy
// when referencing $state/$derived/$effect in .svelte.ts files.
// These are erased by the Svelte compiler and not used at runtime.

declare const $state: {
    <T>(value: T): T;
};

declare const $derived: {
    <T>(fn: () => T): T;
};

declare const $effect: (fn: () => void | (() => void)) => void;
