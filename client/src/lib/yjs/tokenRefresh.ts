import type { WebsocketProvider } from "y-websocket";
import { userManager } from "../../auth/UserManager";

export function refreshAuthAndReconnect(provider: WebsocketProvider): () => Promise<void> {
    return async () => {
        try {
            const t = await userManager.auth.currentUser?.getIdToken(true);
            if (t) {
                const p = provider as any;
                const newAuth = process.env.NODE_ENV === "test" ? `${t}:${Date.now()}` : t;
                p.params = { ...(p.params || {}), auth: newAuth };
                // disconnect 後でも確実に再接続を試みる
                if (p.wsconnected !== true) p.connect();
            }
        } catch {}
    };
}

export function attachTokenRefresh(provider: WebsocketProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    // auth 状態通知にフックして再認証・再接続を行う（引数は未使用）
    return userManager.addEventListener(() => {
        void handler();
    });
}
