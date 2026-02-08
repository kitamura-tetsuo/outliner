import type { HocuspocusProvider } from "@hocuspocus/provider";
import { userManager } from "../../auth/UserManager";

// Type for provider that supports token refresh
export type TokenRefreshableProvider = HocuspocusProvider & {
    __wsDisabled?: boolean;
    status?: string;
    configuration?: {
        websocketProvider?: {
            status?: string;
        };
    };
    url?: string;
};

export function refreshAuthAndReconnect(provider: TokenRefreshableProvider): () => Promise<void> {
    return async () => {
        try {
            console.log("[tokenRefresh] refreshAuthAndReconnect triggered");
            // IMPORTANT: Do NOT use getIdToken(true) here!
            // This function is triggered by onIdTokenChanged.
            // getIdToken(true) forces a refresh, which triggers onIdTokenChanged again, causing an infinite loop.
            // The token provided here via the SDK's event or cache is already sufficiently fresh.
            const t = await userManager.auth.currentUser?.getIdToken();
            console.log("[tokenRefresh] Got new token:", !!t);
            // HocuspocusProvider handles token via the token function passed at creation
            // To refresh, we can call sendToken() which will invoke the token function
            // Do not reconnect if WS is disabled (suppressed in test environment)
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
            // Update the URL with the new token so that future reconnections (which rely on the URL for handshake) pass
            // HocuspocusProvider re-uses the initial URL string, so if we don't update it, it sends the old/expired token.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = provider.configuration as any;
            if (config?.url && typeof config.url === "string") {
                const urlObj = new URL(config.url);
                urlObj.searchParams.set("token", t);
                config.url = urlObj.toString();
                if ((provider as TokenRefreshableProvider).url) {
                    (provider as TokenRefreshableProvider).url = config.url;
                }
                console.log("[tokenRefresh] Updated provider.configuration.url & provider.url with fresh token");
            }

            // For HocuspocusProvider, we call sendToken() to refresh authentication
            // This will invoke the token function and send the new token to the server

            // Check status - if disconnected, just connect (which picks up new token)
            // HocuspocusProvider status getter
            let status = provider.status as string;
            // Fallback for some Hocuspocus versions or test environments where status getter might be missing
            if (!status && provider.configuration?.websocketProvider) {
                status = provider.configuration.websocketProvider.status;
            }
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
    // Hook into auth state notification to perform re-authentication and reconnection (argument is unused)
    return userManager.addEventListener(() => {
        void handler();
    });
}
