// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

// DOM types - exported to be accessible globally
export type NodeListOf<T> = globalThis.NodeListOf<T>;

// Callback types
export type FrameRequestCallback = (time: number) => void;

// Console type - exported to be accessible globally
export type Console = typeof console;

// Extended Window interface for app-specific properties
export interface Window {
    DEBUG_MODE?: boolean;

    // Test environment flags
    __E2E__?: boolean;
    __E2E_LAYOUT_MOUNTED__?: boolean;
    __E2E_DROP_PATCHED__?: boolean;
    __E2E_ATTEMPTED_DROP__?: boolean;
    __E2E_DROP_HANDLERS__?: Array<(target: unknown, event: unknown) => void>;
    __vite_plugin_react_preamble_installed__?: boolean;

    // Store references
    generalStore?: unknown;
    appStore?: unknown;
    firestoreStore?: unknown;
    editorOverlayStore?: unknown;
    presenceStore?: unknown;

    // Test and debug helpers
    __USER_MANAGER__?: unknown;
    __YJS_STORE__?: unknown;
    __YJS_CLIENT_REGISTRY__?: unknown;
    __PROVIDER__?: unknown;
    __DOC__?: unknown;
    __pollingMonitor__?: unknown;
    __KEY_EVENT_HANDLER__?: unknown;

    // Clipboard and text handling
    lastCopiedText?: string;
    lastCopiedIsBoxSelection?: boolean;
    lastCopiedIsBoxSelectionCopy?: boolean;
    lastCopiedIsBoxSelectionCut?: boolean;
    lastBoxSelectionPaste?: unknown;
    lastCopyText?: string;
    lastPastedText?: string;
    lastVSCodeMetadata?: unknown;

    // Search panel
    __SEARCH_PANEL_VISIBLE__?: boolean;
    __OPEN_SEARCH__?: (() => Promise<void>) | undefined;

    // Test environment
    testEnvVars?: Record<string, unknown>;
    ALIAS_PICKER_SHOW_COUNT?: number;

    // Patched APIs
    File?: unknown;
    DataTransfer?: unknown;
}

// NodeJS namespace for compatibility
declare global {
    namespace NodeJS {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        export interface Timeout {}
    }
}

export {};
