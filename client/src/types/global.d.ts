// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

// DOM types
type NodeListOf<T> = globalThis.NodeListOf<T>;

// Callback types
type FrameRequestCallback = (time: number) => void;

// Cursor types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cursor = any;

// Console type
type Console = typeof console;

// Cursor utility functions
declare function getCurrentLineIndex(): number;
declare function getLineStartOffset(index: number): number;
declare function getLineEndOffset(index: number): number;

// NodeJS namespace for compatibility
declare global {
    namespace NodeJS {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface Timeout {}
    }
}
