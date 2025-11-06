// Global type declarations for ESLint no-undef rule
// These types are available in TypeScript but ESLint needs them declared

// Service Worker types
declare const ServiceWorkerGlobalScope: {
    prototype: ServiceWorkerGlobalScope;
    new(): ServiceWorkerGlobalScope;
};

// DOM types for requestAnimationFrame
declare type FrameRequestCallback = (time: number) => void;

// Node.js types
declare namespace NodeJS {
    type Timeout = ReturnType<typeof setTimeout>;
}

interface Window {
    mockFluidClient?: boolean;
    mockUser?: {
        id: string;
        name: string;
        email?: string;
    };
    mockFluidToken?: {
        token: string;
        user: {
            id: string;
            name: string;
        };
    };
    mockContainerConnected?: boolean;
    _alertMessage?: string;
    __FLUID_CLIENT__?: object;
    getFluidTreeDebugData?: () => Record<string, unknown>;
    getYjsTreeDebugData?: () => Record<string, unknown>;
    getYjsTreePathData?: (path?: string) => Record<string, unknown>;
    __E2E_DEBUG__?: boolean;
    __E2E__?: boolean;
    __E2E_QS_PATCHED?: boolean;
    __E2E_GETATTR_PATCHED?: boolean;
    DEBUG_MODE?: boolean;
    lastPasteLines?: string[];
    lastPasteSelections?: unknown;
    lastPasteActiveItemId?: string;
    lastPastedText?: string;
    lastVSCodeMetadata?: unknown;
    E2E_LOGS?: Array<
        { tag: string; id: string; url: string; t: number; } | { tag: string; [key: string]: unknown; t: number; }
    >;
    aliasPickerStore?: {
        lastConfirmedItemId?: string | null;
        lastConfirmedTargetId?: string | null;
        lastConfirmedAt?: number | null;
    };
    __SEARCH_PANEL_VISIBLE__?: boolean;
    __E2E_LAST_MATCH_COUNT__?: number;
    ALIAS_PICKER_SHOW_COUNT?: number;
    __YJS_STORE__?: unknown;
    generalStore?: {
        pages?: {
            current?: Array<Item>;
        };
    };
}
