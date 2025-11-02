// Global type declarations for ESLint no-undef rule
// These types are available in TypeScript but ESLint needs them declared

// Service Worker types
declare interface ServiceWorkerGlobalScope {
    readonly skipWaiting?: () => Promise<void>;
    readonly clients?: {
        readonly claim?: () => Promise<void>;
        openWindow?: (url: string) => Promise<WindowClient | null>;
        matchAll?: (options?: ClientMatchOptions) => Promise<Client[]>;
    };
}

// DOM types for requestAnimationFrame
declare type FrameRequestCallback = (time: number) => void;

// DOM types for createElement
declare interface ElementCreationOptions {
    is?: string;
}

// DOM types for Client
declare interface Client {
    readonly id: string;
    readonly url: string;
    readonly type: "window" | "worker" | "sharedworker" | "document" | "audio" | "image" | "video" | "message";
    readonly lifecycle: "installing" | "installed" | "activating" | "activated" | "terminated";
    focused?: boolean;
    visibilityState?: "visible" | "hidden" | "prerender" | "unloaded";
    postMessage?: (message: any, transfer?: any[]) => void;
}

// DOM types for WindowClient
declare interface WindowClient extends Client {
    readonly type: "window";
    readonly visibilityState: "visible" | "hidden" | "prerender" | "unloaded";
    focused: boolean;
    focus(): Promise<WindowClient>;
    navigate(url: string): Promise<WindowClient | null>;
}

// DOM types for ClientMatchOptions
declare interface ClientMatchOptions {
    includeUncontrolled?: boolean;
    type?: "window" | "worker" | "sharedworker" | "document" | "audio" | "image" | "video" | "message" | "all";
}

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
    generalStore?: {
        project?: unknown;
        pages?: {
            current?: unknown;
        };
        currentPage?: {
            items?: unknown;
        };
    };
    appStore?: {
        project?: unknown;
        pages?: {
            current?: unknown;
        };
        currentPage?: {
            items?: unknown;
        };
    };
}
