import { goto } from "$app/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentBase, setupGlobalDebugFunctions, withConfiguredBase } from "./debug";

// The goto spy is the framework observation point: it records exactly what
// the exposed bridge hands to SvelteKit navigation.
vi.mock("$app/navigation", () => ({
    goto: vi.fn(() => Promise.resolve()),
}));

const gotoMock = vi.mocked(goto);
const bridge = () =>
    (window as unknown as Record<string, unknown>).__SVELTE_GOTO__ as
        | ((url: string, opts?: Record<string, unknown>) => Promise<void>)
        | undefined;

describe("__SVELTE_GOTO__ debug bridge", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (window as unknown as Record<string, unknown>).__SVELTE_GOTO__;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        delete (window as unknown as Record<string, unknown>).__SVELTE_GOTO__;
    });

    it("navigates an encoded app-root-relative target with query/fragment intact", async () => {
        // The deployed base comes from the real framework primitive; this
        // repository configures none, so the target passes through unchanged.
        const configured = deploymentBase();
        expect(configured).toBe("");

        vi.stubEnv("NODE_ENV", "development");
        setupGlobalDebugFunctions();
        expect(bridge()).toBeDefined();

        // Browser sits on a nested route; the target must stay app-rooted.
        const target = "/Project%20A/Page%20B?isTest=true#frag";
        await bridge()!(target, { replace: true });

        expect(gotoMock).toHaveBeenCalledTimes(1);
        const [reached, opts] = gotoMock.mock.calls[0] as [string, Record<string, unknown>];
        expect(reached).toBe(configured + target);
        // The configured base is carried exactly once (zero times when empty).
        const occurrences = configured === "" ? 0 : reached.split(configured).length - 1;
        expect(occurrences).toBe(configured === "" ? 0 : 1);
        expect(opts).toEqual({ replace: true });

        // Real URL parsing from a nested page: destination, query and
        // fragment resolve exactly, never relative to the page directory.
        const resolved = new URL(reached, "http://localhost/some/nested/page");
        expect(resolved.pathname).toBe("/Project%20A/Page%20B");
        expect(resolved.search).toBe("?isTest=true");
        expect(resolved.hash).toBe("#frag");
    });

    it("passes non-app-root targets to navigation untouched", async () => {
        vi.stubEnv("NODE_ENV", "development");
        setupGlobalDebugFunctions();

        // Relative paths and protocol-relative URLs are not app-root-relative:
        // the bridge must not prefix them with the deployment base.
        await bridge()!("relative/page", { replace: true });
        await bridge()!("//cdn.example.com/x");
        expect(withConfiguredBase("relative/page")).toBe("relative/page");
        expect(withConfiguredBase("//cdn.example.com/x")).toBe("//cdn.example.com/x");

        const handed = gotoMock.mock.calls.map(call => call[0] as string);
        expect(handed).toEqual(["relative/page", "//cdn.example.com/x"]);
    });

    it("rejects when the underlying navigation fails", async () => {
        vi.stubEnv("NODE_ENV", "development");
        setupGlobalDebugFunctions();

        gotoMock.mockRejectedValueOnce(new Error("navigation boom"));
        await expect(bridge()!("/demo/Page?isTest=true")).rejects.toThrow("navigation boom");
    });

    it("stays absent in NODE_ENV=test", () => {
        expect(process.env.NODE_ENV).toBe("test");
        setupGlobalDebugFunctions();
        expect(bridge()).toBeUndefined();
    });
});
