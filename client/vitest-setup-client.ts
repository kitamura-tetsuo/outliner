import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { vi } from "vitest";

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

// add more mocks here if you need them
