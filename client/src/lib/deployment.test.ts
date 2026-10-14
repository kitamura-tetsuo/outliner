import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDeployment(mode?: string) {
    vi.resetModules();
    if (mode === undefined) vi.stubEnv("VITE_OUTLINER_DEPLOYMENT_MODE", "");
    else vi.stubEnv("VITE_OUTLINER_DEPLOYMENT_MODE", mode);
    return import("./deployment");
}

describe("deployment contract", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("defaults an unset deployment mode to cloud", async () => {
        expect((await loadDeployment()).deploymentMode).toBe("cloud");
    });

    it("rejects an unsupported deployment mode", async () => {
        await expect(loadDeployment("hybrid")).rejects.toThrow("Invalid VITE_OUTLINER_DEPLOYMENT_MODE: hybrid");
    });

    it("requires the backend descriptor to match the built client", async () => {
        const { verifyDeployment } = await loadDeployment("onprem");
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(JSON.stringify({ deploymentMode: "cloud" }), { status: 200 }),
        );
        await expect(verifyDeployment(fetcher)).rejects.toThrow(
            "Deployment mismatch: client is onprem, server is cloud",
        );
        expect(fetcher).toHaveBeenCalledWith("/api/deployment", { credentials: "same-origin" });
    });
});
