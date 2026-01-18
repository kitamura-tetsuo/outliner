import type { HocuspocusProvider } from "@hocuspocus/provider";
import { userManager } from "../../auth/UserManager";

// Type for provider that supports token refresh
type TokenRefreshableProvider = HocuspocusProvider & {
    __wsDisabled?: boolean;
};

export function refreshAuthAndReconnect(provider: TokenRefreshableProvider): () => Promise<void> {
    return async () => {
        try {
            const t = await userManager.auth.currentUser?.getIdToken(true);
            if (t) {
                // HocuspocusProvider handles token via the token function passed at creation
                // To refresh, we can call sendToken() which will invoke the token function
                // WS が無効化されている場合は再接続を行わない（テスト環境抑止）
                if (provider?.__wsDisabled === true) {
                    return;
                }
                // For HocuspocusProvider, we call sendToken() to refresh authentication
                // This will invoke the token function and send the new token to the server
                try {
                    await provider.sendToken();
                } catch {
                    // If sendToken fails, try reconnecting
                    provider.disconnect();
                    await provider.connect();
                }
            }
        } catch {}
    };
}

export function attachTokenRefresh(provider: TokenRefreshableProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    // auth 状態通知にフックして再認証・再接続を行う（引数は未使用）
    return userManager.addEventListener(() => {
        void handler();
    });
}
