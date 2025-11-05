// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

// DOM types
export type NodeListOf<T> = globalThis.NodeListOf<T>;

// Callback types
type FrameRequestCallback = (time: number) => void;

// Console type
type Console = typeof console;

// NodeJS namespace for compatibility

declare namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Timeout {}
}

// Window interface extensions for application-specific globals
declare global {
    interface Window {
        __E2E__?: boolean;
        __E2E_DROP_HANDLERS__?: unknown[];
        __E2E_LAST_MATCH_COUNT__?: number;
        DEBUG_MODE?: boolean;
        __SEARCH_PANEL_VISIBLE__?: boolean;
        __CURRENT_PROJECT__?: unknown;
        __YJS_SERVICE__?: unknown;
        __YJS_STORE__?: unknown;
        generalStore?: unknown;
        appStore?: unknown;
        presenceStore?: unknown;
        aliasPickerStore?: unknown;
        lastPasteLines?: string[];
        lastPasteSelections?: unknown[];
        lastPasteActiveItemId?: string;
    }
}
