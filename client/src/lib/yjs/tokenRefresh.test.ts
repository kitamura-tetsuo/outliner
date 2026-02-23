import { beforeEach, describe, expect, it, vi } from "vitest";
import { userManager } from "../../auth/UserManager";
import { attachTokenRefresh, refreshAuthAndReconnect } from "./tokenRefresh";
import type { TokenRefreshableProvider } from "./tokenRefresh";

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: {
                getIdToken: vi.fn(),
            },
        },
        addEventListener: vi.fn(),
    },
}));

describe("tokenRefresh", () => {
    let mockProvider: {
        disconnect: ReturnType<typeof vi.fn>;
        connect: ReturnType<typeof vi.fn>;
        sendToken: ReturnType<typeof vi.fn>;
        status?: string;
        configuration: {
            url?: string;
            websocketProvider?: { status: string; };
        };
        url?: string;
        __wsDisabled?: boolean;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockProvider = {
            disconnect: vi.fn(),
            connect: vi.fn(),
            sendToken: vi.fn(),
            status: "connected",
            configuration: {
                url: "ws://localhost:1234?token=old",
                websocketProvider: { status: "connected" },
            },
            url: "ws://localhost:1234?token=old",
        };
    });

    const getProvider = () => mockProvider as unknown as TokenRefreshableProvider;

    describe("refreshAuthAndReconnect", () => {
        it("should refresh token and update URL when connected", async () => {
            const newToken = "new-token";
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue(newToken);

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.configuration.url).toContain("token=new-token");
            expect(mockProvider.url).toBe(mockProvider.configuration.url);
            expect(mockProvider.sendToken).toHaveBeenCalled();
        });

        it("should skip further actions if WS is disabled", async () => {
            mockProvider.__wsDisabled = true;
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");
            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(userManager.auth.currentUser?.getIdToken).toHaveBeenCalled();
            expect(mockProvider.sendToken).not.toHaveBeenCalled();
            expect(mockProvider.connect).not.toHaveBeenCalled();
        });

        it("should reconnect if no token", async () => {
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue(null as unknown as string);

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.disconnect).toHaveBeenCalled();
            expect(mockProvider.connect).toHaveBeenCalled();
        });

        it("should force reconnect if status is disconnected", async () => {
            mockProvider.status = "disconnected";
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.connect).toHaveBeenCalled();
            expect(mockProvider.sendToken).not.toHaveBeenCalled();
        });

        it("should interrupt and reconnect if status is connecting", async () => {
            mockProvider.status = "connecting";
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.disconnect).toHaveBeenCalled();
            expect(mockProvider.connect).toHaveBeenCalled();
        });

        it("should fallback to sendToken failure and then reconnect", async () => {
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");
            mockProvider.sendToken.mockRejectedValue(new Error("Fail"));

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.sendToken).toHaveBeenCalled();
            expect(mockProvider.disconnect).toHaveBeenCalled();
            expect(mockProvider.connect).toHaveBeenCalled();
        });

        it("should handle missing configuration or URL gracefully", async () => {
            delete mockProvider.configuration.url;
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.sendToken).toHaveBeenCalled();
        });

        it("should handle error in getIdToken gracefully", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockRejectedValue(new Error("Auth error"));

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();
            // Should not crash
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it("should use fallback status from websocketProvider", async () => {
            delete mockProvider.status;
            mockProvider.configuration.websocketProvider!.status = "disconnected";
            vi.mocked(userManager.auth.currentUser!.getIdToken).mockResolvedValue("token");

            const refresh = refreshAuthAndReconnect(getProvider());
            await refresh();

            expect(mockProvider.connect).toHaveBeenCalled();
        });
    });

    describe("attachTokenRefresh", () => {
        it("should attach listener to userManager", () => {
            const unregister = vi.fn();
            vi.mocked(userManager.addEventListener).mockReturnValue(unregister);

            const result = attachTokenRefresh(getProvider());

            expect(userManager.addEventListener).toHaveBeenCalled();
            expect(result).toBe(unregister);

            const handler = vi.mocked(userManager.addEventListener).mock.calls[0][0];
            handler(
                {
                    user: { id: "test", name: "Test" },
                } as unknown as any, /* eslint-disable-line @typescript-eslint/no-explicit-any */
            );
        });
    });
});
