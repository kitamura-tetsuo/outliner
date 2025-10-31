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
}
