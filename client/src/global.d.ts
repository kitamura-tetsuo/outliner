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

    // GlobalTextArea properties
    KeyEventHandler?: any;
    __KEY_EVENT_HANDLER__?: any;
    Items?: any;
    generalStore?: any;
    __ALIAS_FWD__?: (ev: KeyboardEvent) => void;
    __SLASH_FWD__?: (ev: KeyboardEvent) => void;
    __KEYSTREAM__?: string;
    __KEYSTREAM_FWD__?: (ev: KeyboardEvent) => void;
    __TYPING_FWD__?: (ev: KeyboardEvent) => void;
    commandPaletteStore?: any;
    __PALETTE_FWD__?: (ev: KeyboardEvent) => void;
    __GLOBAL_KEY_FWD__?: (ev: KeyboardEvent) => void;
    DEBUG_MODE?: string | boolean;
}
