import type { WebsocketProvider } from "y-websocket";
import { userManager } from "../../auth/UserManager";

export function refreshAuthAndReconnect(provider: WebsocketProvider): () => Promise<void> {
    return async () => {
        try {
            const t = await userManager.auth.currentUser?.getIdToken(true);
            if (t) {
                const p = provider as any;
                p.params = { ...(p.params || {}), auth: t };
                if (p.shouldConnect && p.wsconnected !== true) p.connect();
            }
        } catch {}
    };
}

export function attachTokenRefresh(provider: WebsocketProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    return userManager.addEventListener(handler);
}
