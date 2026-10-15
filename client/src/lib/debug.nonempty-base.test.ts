import { goto } from "$app/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentBase, setupGlobalDebugFunctions } from "./debug";

// SvelteKit navigation is the observation point: the spy records exactly
// what the exposed bridge hands to the framework.
vi.mock("$app/navigation", () => ({
    goto: vi.fn(() => Promise.resolve()),
}));

// Simulate a deployment built with a nonempty application base. Only the
// deployment configuration is composed here: the real $app/paths resolver
// still runs underneath, and every assertion below goes through the real
// deploymentBase(), the real withConfiguredBase() and the real exposed
// bridge. A bridge that dropped the deployment base (for example by
// hardcoding an empty base) fails these tests.
vi.mock("$app/paths", async (importOriginal) => {
    const actual = await importOriginal<typeof import("$app/paths")>();
    const realResolve = actual.resolve as unknown as (path: string) => string;
    const resolve = ((path: string) => `/app${realResolve(path)}`) as typeof actual.resolve;
    return { ...actual, resolve };
});

const gotoMock = vi.mocked(goto);
const bridge = () =>
    (window as unknown as Record<string, unknown>).__SVELTE_GOTO__ as
        | ((url: string, opts?: Record<string, unknown>) => Promise<void>)
        | undefined;

describe("__SVELTE_GOTO__ debug bridge with a nonempty application base", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as unknown as Record<string, unknown>).__SVELTE_GOTO__;
        vi.stubEnv("NODE_ENV", "development");
        setupGlobalDebugFunctions();
        expect(bridge()).toBeDefined();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        delete (window as unknown as Record<string, unknown>).__SVELTE_GOTO__;
    });

    it("reports the simulated deployment base from the real framework primitive", () => {
        expect(deploymentBase()).toBe("/app");
    });

    it("reaches project app / Page B when the project title equals the base", async () => {
        // App-root-relative input: project "app", page "Page B". A bridge
        // that mistook the leading "/app" for an already-applied deployment
        // prefix would navigate to /app/Page%20B (a different route) and
        // drop the deployment base.
        await bridge()!("/app/Page%20B?view=1#frag", { replace: true });

        expect(gotoMock).toHaveBeenCalledTimes(1);
        const [reached, opts] = gotoMock.mock.calls[0] as [string, Record<string, unknown>];
        expect(reached).toBe("/app/app/Page%20B?view=1#frag");
        expect(opts).toEqual({ replace: true });

        // Real URL parsing from a nested page: the base is carried exactly
        // once, then the project/page destination with suffix data intact.
        const resolved = new URL(reached, "http://localhost/some/nested/page");
        expect(resolved.pathname).toBe("/app/app/Page%20B");
        expect(resolved.search).toBe("?view=1");
        expect(resolved.hash).toBe("#frag");
    });

    it("prefixes an ordinary project target once with query/fragment intact", async () => {
        await bridge()!("/demo/Page?isTest=true#s");

        expect(gotoMock).toHaveBeenCalledTimes(1);
        const [reached] = gotoMock.mock.calls[0] as [string];
        expect(reached).toBe("/app/demo/Page?isTest=true#s");
        expect(reached.startsWith("/app/")).toBe(true);

        const resolved = new URL(reached, "http://localhost/some/nested/page");
        expect(resolved.pathname).toBe("/app/demo/Page");
        expect(resolved.search).toBe("?isTest=true");
        expect(resolved.hash).toBe("#s");
    });
});
