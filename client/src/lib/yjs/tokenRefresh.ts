import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { UserManager } from "../../auth/UserManager";
import { getLogger } from "../logger";

const logger = getLogger("tokenRefresh");

/**
 * Periodically refresh authentication token and update Hocuspocus provider
 * @param provider Hocuspocus provider
 * @param userManager User manager
 */
export function attachTokenRefresh(provider: HocuspocusProvider, userManager: UserManager) {
    // Update token when user authentication state changes
    userManager.addEventListener(async (result) => {
        if (result?.user) {
            try {
                // Get new token
                const token = await userManager.auth.currentUser?.getIdToken(true);
                if (token) {
                    logger.debug("Updating auth token for Yjs connection");

                    // Update provider token
                    provider.configuration.token = token;

                    // Send authentication message if connected
                    if (provider.isConnected) {
                        provider.sendStateless(JSON.stringify({
                            type: "auth",
                            token,
                        }));
                    }
                }
            } catch (error) {
                logger.error("Failed to refresh token:", error);
            }
        }
    });

    // Also set up periodic refresh (every 50 minutes)
    const intervalId = setInterval(async () => {
        if (userManager.isAuthenticated()) {
            await userManager.refreshToken();
        }
    }, 50 * 60 * 1000);

    // Stop interval on provider destroy
    const originalDestroy = provider.destroy.bind(provider);
    provider.destroy = () => {
        clearInterval(intervalId);
        originalDestroy();
    };
}
