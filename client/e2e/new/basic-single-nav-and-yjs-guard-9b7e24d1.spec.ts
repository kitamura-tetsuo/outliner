import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/**
 * Basic verification (single navigation and Yjs write guard)
 * - Ensure only one main frame navigation occurs before the outline page is fully displayed.
 * - Ensure no Yjs writes (specifically: project.addPage) occur before display completion, other than those by prepareTestEnvironment.
 */

test.describe("Basic: single navigation & Yjs guard", () => {
    test("navigates once and no Yjs writes before display", async ({ page }, testInfo) => {
        // Count main frame navigations
        const mainUrls = new Set<string>();
        const mainPaths = new Set<string>();
        const normalizePath = (u: string) => {
            try {
                const url = new URL(u);
                let p = url.pathname;
                if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
                return p;
            } catch {
                return u;
            }
        };
        page.on("framenavigated", (frame) => {
            if (frame !== page.mainFrame()) return;
            try {
                const href = frame.url();
                if (href && href.startsWith("http")) {
                    mainUrls.add(href);
                    mainPaths.add(normalizePath(href));
                }
            } catch {}
        });

        // Prepare Yjs write detection probe early (wrap after generalStore is ready)
        await page.addInitScript(() => {
            // eslint-disable-next-line no-restricted-globals
            (window as any).__E2E_WRITES = [] as Array<{ method: string; ts: number; }>; // Write log
            // eslint-disable-next-line no-restricted-globals
            (window as any).__E2E_INSTALL_WRITES__ = function install() {
                try {
                    // eslint-disable-next-line no-restricted-globals
                    const gs: any = (window as any).generalStore;
                    if (!gs?.project) return false;
                    const proj: any = gs.project;
                    if (!proj || (proj as any).__e2eWrapped) return !!proj;
                    const wrap = (obj: any, name: string) => {
                        try {
                            const orig = obj?.[name];
                            if (typeof orig !== "function") return;
                            obj[name] = function(...args: any[]) {
                                try {
                                    // eslint-disable-next-line no-restricted-globals
                                    (window as any).__E2E_WRITES.push({ method: name, ts: Date.now() });
                                } catch {}
                                return orig.apply(this, args);
                            };
                        } catch {}
                    };
                    // Wrap representative write APIs (strictly monitoring only project.addPage here)
                    wrap(proj, "addPage");
                    (proj as any).__e2eWrapped = true;
                    return true;
                } catch {
                    return false;
                }
            };
        });

        // Single navigation target (skip initial home transition, navigate to target only once)
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined);

        // Install write probe when generalStore becomes available
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs: any = (window as any).generalStore;
            return !!(gs && gs.project);
        });
        await page.evaluate(() => {
            try {
                // eslint-disable-next-line no-restricted-globals
                (window as any).__E2E_INSTALL_WRITES__?.();
            } catch {}
        });

        // Display outline page (wait for OutlinerBase data-testid)
        const outliner = page.locator('[data-testid="outliner-base"]').first();
        await outliner.waitFor({ state: "visible", timeout: 10000 });

        // Debug: Output actually recorded URLs/Paths
        console.log("E2E Navigated URLs:", Array.from(mainUrls));
        console.log("E2E Navigated Paths:", Array.from(mainPaths));

        // Verification 1: Only 1 URL (path) navigation in main frame (ignoring about:blank / trailing slash differences)
        expect(mainPaths.size).toBe(1);

        // Verification 2: No Yjs writes other than prepareTestEnvironment before display completion
        // eslint-disable-next-line no-restricted-globals
        const writes = await page.evaluate(() => (window as any).__E2E_WRITES as Array<any>);
        expect(Array.isArray(writes)).toBe(true);
        expect(writes.length).toBe(0);
    });
});
