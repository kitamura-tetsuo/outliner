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

// Forward declarations for test globals
declare module "../../stores/PresenceStore.svelte" {
    export class PresenceStore {}
}
declare module "../../stores/yjsStore.svelte" {
    export class YjsStore {}
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
    __YJS_STORE__?: any;
    presenceStore?: any;
    getFluidTreeDebugData?: () => Record<string, unknown>;
    getYjsTreeDebugData?: () => Record<string, unknown>;
    getYjsTreePathData?: (path?: string) => Record<string, unknown>;
}

declare global {
    var __YJS_STORE__: any;
    var presenceStore: any;
}
