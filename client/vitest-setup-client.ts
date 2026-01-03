import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

// Type definitions to avoid no-undef errors
type FrameRequestCallback = (time: number) => void;
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Timeout {}
}

// Define self for Firebase compatibility
Object.defineProperty(globalThis, "self", {
    value: globalThis,
    writable: true,
    enumerable: true,
    configurable: true,
});

// required for svelte5 + jsdom as jsdom does not support matchMedia
Object.defineProperty(window, "matchMedia", {
    writable: true,
    enumerable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Polyfill requestAnimationFrame for jsdom tests so fake timers can drive animations deterministically.
if (typeof globalThis.requestAnimationFrame !== "function") {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
        return setTimeout(() => cb(performance.now()), 16) as unknown as number;
    };
}

if (typeof globalThis.cancelAnimationFrame !== "function") {
    globalThis.cancelAnimationFrame = (id: number): void => {
        clearTimeout(id as unknown as NodeJS.Timeout);
    };
}

// ---- Vitest bootstrap: ensure a single firestoreStore instance shared across UI & tests ----
try {
    // Ensure window exists
    (globalThis as any).window ||= globalThis as any;
    // Import the real store early so it can publish itself to window.__FIRESTORE_STORE__
    // and so subsequent imports (including Svelte-compiled graph) pick up the same instance.
    // Note: this path is relative to project root (vite config uses the same resolver in tests)
    const mod = await import("./src/stores/firestoreStore.svelte");
    const fsStore = (mod as any).firestoreStore;
    if (fsStore) {
        (globalThis as any).window.__FIRESTORE_STORE__ ||= fsStore;
        (globalThis as any).__FIRESTORE_STORE__ ||= fsStore;
    }
} catch {
    // no-op: if import fails here, module will still set __FIRESTORE_STORE__ on first import
}

// ---- Vitest bootstrap: ensure yjsStore is available on globalThis for integration tests ----
try {
    // Import the real yjsStore early so it can publish itself to window.__YJS_STORE__
    const yjsMod = await import("./src/stores/yjsStore.svelte");
    const yjsStoreInstance = (yjsMod as any).yjsStore;
    if (yjsStoreInstance) {
        (globalThis as any).window.__YJS_STORE__ ||= yjsStoreInstance;
        (globalThis as any).__YJS_STORE__ ||= yjsStoreInstance;
    }
} catch {
    // no-op: if import fails here, module will still set __YJS_STORE__ on first import
}

// ---- Vitest bootstrap: set up localStorage for test environment detection ----
// This is needed by ScrapboxFormatter.getProjectPrefix() to return a default project prefix
try {
    if (typeof globalThis.localStorage === "undefined") {
        // Polyfill localStorage for jsdom
        const localStorageMock: NonNullable<typeof globalThis.localStorage> = {
            _data: {} as Record<string, string>,
            getItem(key: string): string | null {
                return this._data[key] ?? null;
            },
            setItem(key: string, value: string): void {
                this._data[key] = String(value);
            },
            removeItem(key: string): void {
                delete this._data[key];
            },
            clear(): void {
                this._data = {};
            },
        };
        (globalThis as { localStorage?: typeof localStorageMock; }).localStorage = localStorageMock;
    }
    // Set test environment flags
    globalThis.localStorage.setItem("VITE_IS_TEST", "true");
    globalThis.localStorage.setItem("VITE_E2E_TEST", "true");
} catch {
    // no-op: if localStorage setup fails
}

// add more mocks here if you need them
