import type { WebsocketProvider } from "y-websocket";
import { userManager } from "../../auth/UserManager";

export function refreshAuthAndReconnect(provider: WebsocketProvider): () => Promise<void> {
    return async () => {
        try {
            const t = await userManager.auth.currentUser?.getIdToken(true);
            if (t) {
                provider.wsParams = { ...(provider.wsParams || {}), auth: t } as any;
                if (provider.shouldConnect && provider.wsconnected !== true) provider.connect();
            }
        } catch {}
    };
}

export function attachTokenRefresh(provider: WebsocketProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    return userManager.addEventListener(handler);
}
