// Global type definitions to avoid ESLint no-undef errors
// These types are available in the browser environment but ESLint may not recognize them

import type { UserManager } from "../auth/UserManager";
import type { Project } from "../schema/app-schema";
import type { SelectionRange } from "../stores/EditorOverlayStore.svelte";
import type { GeneralStore } from "../stores/store.svelte";

// DOM types
type NodeListOf<T> = globalThis.NodeListOf<T>;

// Callback types
type FrameRequestCallback = (time: number) => void;

// Console type
type Console = typeof console;

// Window extension for test environment globals
declare global {
    interface Window {
        __CURRENT_PROJECT__?: Project;
        __CURRENT_PROJECT_TITLE__?: string;
        generalStore?: GeneralStore;
        __YJS_SERVICE__?: unknown;
        __YJS_STORE__?: unknown;
        __YJS_CLIENT_REGISTRY__?: unknown;
        __FLUID_CLIENT_REGISTRY__?: unknown;
        __USER_MANAGER__?: UserManager;
        __selectionList?: SelectionRange[];
        __FIRESTORE_STORE__?: unknown;
        __E2E__?: boolean;
        appStore?: {
            project?: Project;
        };
        DEBUG_MODE?: boolean;
        lastCopiedText?: string;
        navigator?: {
            webdriver?: boolean;
        };
        clipboard?: {
            writeText?: (text: string) => Promise<void>;
        };
    }
}

// NodeJS namespace for compatibility
declare namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Timeout {}
}
