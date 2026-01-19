import type { HocuspocusProvider } from "@hocuspocus/provider";
import { userManager } from "../../auth/UserManager";

// Type for provider that supports token refresh
type TokenRefreshableProvider = HocuspocusProvider & {
    __wsDisabled?: boolean;
};

export function refreshAuthAndReconnect(provider: TokenRefreshableProvider): () => Promise<void> {
    return async () => {
        try {
            console.log("[tokenRefresh] refreshAuthAndReconnect triggered");
            const t = await userManager.auth.currentUser?.getIdToken(true);
            console.log("[tokenRefresh] Got new token:", !!t);
            // HocuspocusProvider handles token via the token function passed at creation
            // To refresh, we can call sendToken() which will invoke the token function
            // WS が無効化されている場合は再接続を行わない（テスト環境抑止）
            if (provider?.__wsDisabled === true) {
                console.log("[tokenRefresh] WS disabled, skipping");
                return;
            }
            // If no token (user disconnected), explicitly reconnect
            if (!t) {
                console.log("[tokenRefresh] No token, forcing reconnect sequence");
                try {
                    provider.disconnect();
                } catch {}
                try {
                    await provider.connect();
                } catch {}
                return;
            }
            // For HocuspocusProvider, we call sendToken() to refresh authentication
            // This will invoke the token function and send the new token to the server

            // Check status - if disconnected, just connect (which picks up new token)
            // HocuspocusProvider status getter
            const status = provider.status as string;
            console.log(`[tokenRefresh] Provider status: ${status}`);

            if (status === "disconnected" || status === "connecting") {
                console.log(`[tokenRefresh] Provider ${status}, ensuring connection`);
                // If currently connecting, disconnect first to ensure we use the fresh token
                // (the previous attempt might have used an old/expired token)
                if (status === "connecting") {
                    try {
                        provider.disconnect();
                        console.log("[tokenRefresh] Interrupted connecting state to force fresh token");
                    } catch (e) {
                        console.warn("[tokenRefresh] Disconnect failed:", e);
                    }
                }

                try {
                    await provider.connect();
                    console.log("[tokenRefresh] connect() called");
                } catch (e) {
                    console.error("[tokenRefresh] connect() failed:", e);
                }
                return;
            }

            try {
                console.log("[tokenRefresh] Calling provider.sendToken()");
                await provider.sendToken();
                console.log("[tokenRefresh] provider.sendToken() success");
            } catch (e) {
                console.log("[tokenRefresh] provider.sendToken() failed:", e);
                // If sendToken fails, try reconnecting
                provider.disconnect();
                console.log("[tokenRefresh] Calling provider.connect()");
                await provider.connect();
            }
        } catch (err) {
            console.error("[tokenRefresh] Error in refreshAuthAndReconnect:", err);
        }
    };
}

export function attachTokenRefresh(provider: TokenRefreshableProvider): () => void {
    const handler = refreshAuthAndReconnect(provider);
    // auth 状態通知にフックして再認証・再接続を行う（引数は未使用）
    return userManager.addEventListener(() => {
        void handler();
    });
}
