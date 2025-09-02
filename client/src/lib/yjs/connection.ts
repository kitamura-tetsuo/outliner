import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { userManager } from "../../auth/UserManager";
import { pageRoomPath, projectRoomPath } from "./roomPath";
import { attachTokenRefresh } from "./tokenRefresh";

export type ProjectConnection = {
    doc: Y.Doc;
    provider: WebsocketProvider;
    awareness: Awareness;
    dispose: () => void;
};

function getWsBase(): string {
    const url = import.meta.env.VITE_YJS_WS_URL || `ws://localhost:${import.meta.env.VITE_YJS_PORT || 7093}`;
    return url as string;
}

async function getFreshIdToken(): Promise<string> {
    // Wait for auth and fetch a fresh ID token
    const auth = userManager.auth;
    if (!auth.currentUser) {
        // Try short wait using a simple promise
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!auth.currentUser) {
        // As a fallback, trigger userManager.refreshToken to ensure auth flow started
        try {
            await userManager.refreshToken();
        } catch {}
    }
    const token = await auth.currentUser?.getIdToken(true);
    if (!token) throw new Error("No Firebase ID token available");
    return token;
}

export async function createProjectConnection(projectId: string): Promise<ProjectConnection> {
    const doc = new Y.Doc({ guid: projectId });
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);

    // Local persistence keyed by room path
    new IndexeddbPersistence(room, doc);

    const token = await getFreshIdToken();
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: { auth: token },
        connect: true,
    });

    // Awareness (presence)
    const awareness = provider.awareness;
    const current = userManager.getCurrentUser();
    if (current) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }

    // Refresh auth param on token refresh
    const unsub = attachTokenRefresh(provider);

    const dispose = () => {
        try {
            unsub();
        } catch {}
        try {
            provider.destroy();
        } catch {}
        try {
            doc.destroy();
        } catch {}
    };

    return { doc, provider, awareness, dispose };
}

export async function connectProjectDoc(doc: Y.Doc, projectId: string): Promise<{
    provider: WebsocketProvider;
    awareness: Awareness;
}> {
    const wsBase = getWsBase();
    const room = projectRoomPath(projectId);
    new IndexeddbPersistence(room, doc);
    let token = "";
    try {
        token = await getFreshIdToken();
    } catch {
        // Stay offline if auth is not ready; provider will attempt reconnect later.
    }
    const provider = new WebsocketProvider(wsBase, room, doc, {
        params: token ? { auth: token } : undefined,
        connect: !!token,
    });
    const awareness = provider.awareness;
    const current = userManager.getCurrentUser();
    if (current) {
        awareness.setLocalStateField("user", {
            userId: current.id,
            name: current.name,
            color: undefined,
        });
    }
    // Refresh auth param on token refresh
    attachTokenRefresh(provider);
    return { provider, awareness };
}
