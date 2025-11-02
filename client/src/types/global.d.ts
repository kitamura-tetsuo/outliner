// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

// DOM types
type NodeListOf<T> = globalThis.NodeListOf<T>;

// Extended Window interface for custom properties
interface Window {
    DEBUG_MODE?: boolean;
}

// Callback types
type FrameRequestCallback = (time: number) => void;

// Console type
type Console = typeof console;

// NodeJS namespace for compatibility
declare namespace NodeJS {
    interface Timeout {} // eslint-disable-line @typescript-eslint/no-empty-object-type
}
