// Type-only shims for Svelte 5 runes to keep TypeScript happy
// when referencing $state/$derived/$effect in .svelte.ts files.
// These are erased by the Svelte compiler and not used at runtime.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const $state: {
    <T>(value: T): T;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const $derived: {
    <T>(fn: () => T): T;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const $effect: (fn: () => void | (() => void)) => void;
