// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

// DOM types
type NodeListOf<T> = globalThis.NodeListOf<T>;

// Callback types
type FrameRequestCallback = (time: number) => void;

// Console type
type Console = typeof console;

// NodeJS namespace for compatibility
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Timeout {}
}
