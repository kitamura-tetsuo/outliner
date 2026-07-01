import type { AliasPickerStore } from "../stores/AliasPickerStore.svelte";
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
        __GRAPH_CHART__?: unknown;
        __YJS_SERVICE__?: unknown;
        __YJS_STORE__?: unknown;
        __YJS_CLIENT_REGISTRY__?: unknown;
        __FLUID_CLIENT_REGISTRY__?: unknown;
        __USER_MANAGER__?: UserManager;
        __selectionList?: SelectionRange[];
        __FIRESTORE_STORE__?: unknown;
        __E2E__?: boolean;
        presenceStore?: unknown;
        commandPaletteStore?: unknown;
        __KEYSTREAM__?: unknown;
        __E2E_DEBUG__?: boolean;
        __E2E_ATTEMPTED_DROP__?: boolean;
        __E2E_LAST_FILES__?: File[];
        __ITEM_ID_MAP__?: Record<string, string>;
        DataTransferItemList?: unknown;
        __E2E_DT_ADD_PATCHED__?: boolean;
        __E2E_DT_ITEMS_GETTER_PATCHED__?: boolean;
        __E2E_FILE_CTOR_PATCHED__?: boolean;
        __E2E_DT_CTOR_PATCHED__?: boolean;
        __E2E_LAST_DROP_EVENT__?: Event;
        __E2E_DROP_HANDLERS__?: ((el: Element, ev: DragEvent) => void)[];
        E2E_LOGS?: unknown[];
        __itemCommentPatched?: boolean;
        commentCountsByItemId?: Map<string, number>;
        __SEARCH_PANEL_VISIBLE__?: boolean;
        __E2E_LAST_MATCH_COUNT__?: number;
        __E2E_LAYOUT_MOUNTED__?: boolean;
        __E2E_DROP_PATCHED__?: boolean;
        __PAGE_STATE__?: {
            loaded: boolean;
            projectName?: string;
            pageName?: string;
            hasProject?: boolean;
            hasCurrentPage?: boolean;
            pageNotFound?: boolean;
            error?: string | null;
        };
        __OPEN_SEARCH__?: () => Promise<void>;
        testEnvVars?: Record<string, string>;
        editorStore?: unknown;
        aliasPickerStore?: AliasPickerStore;
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
    type Timeout = Record<string, unknown>;
}
