import { Project as AppProject } from "../schema/app-schema";
import { acquireDemoClient, releaseDemoClient, removeYjsClientByProjectId, resetDemoClientState } from "../services";
import { store } from "../stores/store.svelte";
import { yjsStore } from "../stores/yjsStore.svelte";
import type { YjsClient } from "../yjs/YjsClient";
import { DEMO_PROJECT_NAME, seedDemo, type SeedDemoResult } from "./demoSeed";
import { getLogger } from "./logger";

const logger = getLogger("demoInit");

/**
 * Shared initialization workflow for every `/demo*` route.
 *
 * The warm path (template already valid, no reset needed) must not pay for a
 * seed round trip before the browser is allowed to open its own Yjs
 * connection. Freshness validation and the project connection therefore run in
 * parallel, and the validation result is only awaited for the rare case where
 * the server actually rebuilt the document.
 */

/** Never wait longer than this for freshness validation before reconnect handling gives up. */
const VALIDATION_TIMEOUT_MS = 15000;
/** Re-validate freshness at most this often while the demo stays open. */
const VALIDATION_TTL_MS = 60000;

let validationPromise: Promise<SeedDemoResult> | undefined;
let validationStartedAt = 0;

/**
 * Start (or reuse) the demo freshness validation request. Svelte-managed
 * navigation between demo routes reuses the same in-flight/settled promise, so
 * moving between `/demo`, `/demo/[page]` and `/demo/graph` issues no extra
 * `POST /api/seed-demo`.
 */
export function startDemoValidation(): Promise<SeedDemoResult> {
    const now = Date.now();
    if (!validationPromise || now - validationStartedAt > VALIDATION_TTL_MS) {
        validationStartedAt = now;
        validationPromise = seedDemo();
    }
    return validationPromise;
}

/** Forget the memoized validation so the next visit revalidates. */
export function resetDemoValidationState(): void {
    validationPromise = undefined;
    validationStartedAt = 0;
}

export interface DemoProjectHandle {
    client: YjsClient;
    project: AppProject;
}

export interface DemoInitOptions {
    /** Returns true once the calling component has been destroyed. */
    isDestroyed?: () => boolean;
    /**
     * Called after the background freshness validation settled and changed
     * something: either the server reseeded the document (a fresh handle is
     * passed) or the validation request failed (`seedFailure` is set).
     */
    onValidated?: (update: DemoValidationUpdate) => void;
}

export interface DemoValidationUpdate {
    handle?: DemoProjectHandle;
    reset: boolean;
    seedFailure?: "network" | "http" | "rate-limit";
}

function attachDemoProject(client: YjsClient): DemoProjectHandle {
    yjsStore.yjsClient = client;
    const project = AppProject.fromDoc(client.getProject().ydoc);
    store.project = project;
    return { client, project };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                logger.warn(`Demo validation failed: ${err}`);
                resolve(undefined);
            },
        );
    });
}

/**
 * Drop the current demo client and connect again. Used after the server
 * rebuilt the shared document, so the page reflects the reseeded content
 * instead of a document state the old client already diverged from.
 */
export async function reconnectDemoProject(): Promise<DemoProjectHandle | undefined> {
    resetDemoClientState();
    removeYjsClientByProjectId(DEMO_PROJECT_NAME);
    yjsStore.yjsClient = undefined;
    store.project = undefined;
    store.currentPage = undefined;

    const client = await acquireDemoClient();
    if (!client) return undefined;
    return attachDemoProject(client);
}

/**
 * Connect to the demo project, validating template freshness in parallel.
 * Resolves as soon as the project client is usable; a reseed discovered by the
 * parallel validation is reported through `onValidated`.
 */
export async function initializeDemoProject(options: DemoInitOptions = {}): Promise<DemoProjectHandle> {
    const isDestroyed = options.isDestroyed ?? (() => false);

    // Kick off both immediately: the connection must not queue behind validation.
    const validation = startDemoValidation();
    const clientPromise = acquireDemoClient();

    const client = await clientPromise;
    if (isDestroyed()) {
        if (client) releaseDemoClient();
        throw new DemoInitAborted();
    }
    if (!client) {
        // Surface the validation failure when it explains the missing client.
        const seedResult = await withTimeout(validation, VALIDATION_TIMEOUT_MS);
        if (seedResult && !seedResult.ok && seedResult.reason === "network") {
            throw new Error("Can't reach the demo server — retrying...");
        }
        throw new Error("Failed to connect to the demo project.");
    }

    const handle = attachDemoProject(client);

    // Content is on screen from here on; handle the validation verdict in the
    // background so a slow or delayed response never hides synced content.
    void (async () => {
        const seedResult = await withTimeout(validation, VALIDATION_TIMEOUT_MS);
        if (isDestroyed() || !seedResult) return;
        if (seedResult.reset) {
            logger.info("Demo document was reseeded; reconnecting with a fresh client");
            const next = await reconnectDemoProject();
            if (isDestroyed()) return;
            options.onValidated?.({ handle: next, reset: true });
            return;
        }
        if (!seedResult.ok) {
            options.onValidated?.({ handle, reset: false, seedFailure: seedResult.reason });
            return;
        }
        options.onValidated?.({ handle, reset: false });
    })();

    return handle;
}

/** Thrown when the calling component was destroyed while connecting. */
export class DemoInitAborted extends Error {
    constructor() {
        super("Demo initialization aborted");
        this.name = "DemoInitAborted";
    }
}

/**
 * Manually trigger the reset that otherwise runs every 24 hours and reconnect
 * so the UI reflects the reseeded content.
 */
export async function forceResetDemoProject(): Promise<DemoProjectHandle | undefined> {
    resetDemoValidationState();
    await seedDemo({ force: true, throwOnError: true });
    return reconnectDemoProject();
}

/**
 * Release this component's reference to the demo project, clearing the shared
 * stores once the last demo route is gone.
 *
 * The memoized validation deliberately survives: SvelteKit destroys the old
 * route component before mounting the new one, so clearing it here would make
 * every navigation inside `/demo` issue another seed request. It expires on its
 * own after VALIDATION_TTL_MS.
 */
export function releaseDemoProject(): number {
    const remaining = releaseDemoClient();
    if (remaining === 0) {
        yjsStore.yjsClient = undefined;
        store.project = undefined;
        store.currentPage = undefined;
    }
    return remaining;
}
