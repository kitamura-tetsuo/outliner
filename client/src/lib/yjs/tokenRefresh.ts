import type { WebsocketProvider } from "y-websocket";
import { userManager } from "../../auth/UserManager";

export function refreshAuthAndReconnect(provider: WebsocketProvider): () => Promise<void> {
    return async () => {
        try {
            const t = await userManager.auth.currentUser?.getIdToken(true);
            if (t) {
                (provider as any).params = { ...((provider as any).params || {}), auth: t };
                if ((provider as any).shouldConnect && (provider as any).wsconnected !== true) {
                    (provider as any).connect();
                }
            }
        } catch {}
    };
}

export function attachTokenRefresh(provider: WebsocketProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    return userManager.addEventListener(handler);
}
