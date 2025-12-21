// Minimal Yjs-branch snapshot saver used by E2E tests
// Produces JSON files under client/e2e-snapshots named <label>-yjs.json

import type { Page, TestInfo } from "@playwright/test";

export class DataValidationHelpers {
    /**
     * Convenience helper to be called from test.afterEach to persist a Yjs snapshot.
     * Builds a stable label from the test title and appends -auto-<timestamp>.
     * Swallows errors by design so it never fails the test teardown.
     */
    static async trySaveAfterEach(page: Page, testInfo: TestInfo): Promise<void> {
        try {
            // Check if page is still open before trying to save
            if (page.isClosed()) {
                console.log("[afterEach] Page already closed, skipping snapshot save");
                return;
            }

            // Skip if page was never navigated (e.g., tests using browser fixture directly)
            try {
                const url = page.url();
                if (url === "about:blank" || url === "") {
                    console.log("[afterEach] Page not initialized, skipping snapshot save");
                    return;
                }
            } catch {
                console.log("[afterEach] Page not accessible, skipping snapshot save");
                return;
            }

            const labelBase = testInfo.title.replace(/[^a-z0-9_-]+/gi, "-");
            const label = `${labelBase}-auto-${Date.now()}`;
            await DataValidationHelpers.saveSnapshotsAndCompare(page, label);
        } catch (e: any) {
            // Do not fail the test if snapshot saving fails
            console.warn("[afterEach] snapshot skipped:", e?.message ?? e);
        } finally {
            try {
                // Check if page is still open before trying to dump logs
                if (!page.isClosed()) {
                    // Dump E2E logs if present
                    const logs = await page.evaluate(() => {
                        const w: any = window as any;
                        return Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS.slice(-200) : [];
                    }, { timeout: 2000 });
                    if (Array.isArray(logs) && logs.length) {
                        console.log("[afterEach] E2E_LOGS (last 200):", logs);
                    }
                } else {
                    console.log("[afterEach] Page already closed, skipping log dump");
                }
            } catch (e) {
                console.warn("[afterEach] log dump skipped:", e?.message ?? e);
            }
        }
    }

    /**
     * Cleanup helper to be called from test.afterEach to ensure test isolation.
     * Resets Yjs state and other global state between tests.
     * Swallows errors by design so it never fails the test teardown.
     */
    static async tryCleanupAfterEach(page: Page): Promise<void> {
        try {
            // Check if page is still open before trying to evaluate
            if (page.isClosed()) {
                console.log("[afterEach] Page already closed, skipping cleanup");
                return;
            }

            // Reset Yjs state and other global variables between tests
            // Use a shorter timeout for cleanup to avoid hanging
            await page.evaluate(() => {
                try {
                    // Clear any existing E2E logs
                    const w: any = window as any;
                    if (Array.isArray(w.E2E_LOGS)) {
                        w.E2E_LOGS.length = 0;
                    }

                    // Reset global state that might affect test isolation
                    if (w.generalStore) {
                        // Reset comment-related state
                        if (w.generalStore.openCommentItemId) {
                            w.generalStore.openCommentItemId = null;
                        }
                        if (w.generalStore.openCommentItemIndex) {
                            w.generalStore.openCommentItemIndex = null;
                        }
                    }

                    // Clear any editor overlay state
                    if (w.editorOverlayStore) {
                        try {
                            // Reset cursor state
                            if (w.editorOverlayStore.reset) {
                                w.editorOverlayStore.reset();
                            } else {
                                // Manually clear if no reset method
                                w.editorOverlayStore.cursors = {};
                                w.editorOverlayStore.selections = {};
                                w.editorOverlayStore.activeItemId = null;
                                w.editorOverlayStore.cursorVisible = false;
                                if (w.editorOverlayStore.cursorInstances) {
                                    w.editorOverlayStore.cursorInstances.clear();
                                }
                            }
                        } catch {}
                    }

                    // Clear any alias picker state
                    if (w.aliasPickerStore) {
                        try {
                            if (w.aliasPickerStore.reset) {
                                w.aliasPickerStore.reset();
                            } else {
                                w.aliasPickerStore.isVisible = false;
                                w.aliasPickerStore.selectedOptionId = null;
                                w.aliasPickerStore.query = "";
                            }
                        } catch {}
                    }

                    // Clear any command palette state
                    if (w.commandPaletteStore) {
                        try {
                            if (w.commandPaletteStore.reset) {
                                w.commandPaletteStore.reset();
                            } else {
                                w.commandPaletteStore.isVisible = false;
                                w.commandPaletteStore.query = "";
                            }
                        } catch {}
                    }

                    // Clear any user preferences
                    if (w.userPreferencesStore) {
                        try {
                            if (w.userPreferencesStore.reset) {
                                w.userPreferencesStore.reset();
                            }
                        } catch {}
                    }

                    // Clear search history
                    if (w.searchHistoryStore) {
                        try {
                            if (w.searchHistoryStore.reset) {
                                w.searchHistoryStore.reset();
                            }
                        } catch {}
                    }
                } catch (e) {
                    console.warn("[afterEach] cleanup warning:", e);
                }
            }, { timeout: 5000 }).catch((e) => {
                // Ignore errors during cleanup evaluation
                console.log("[afterEach] cleanup evaluation skipped:", e?.message ?? e);
            });
        } catch (e: any) {
            // Do not fail the test if cleanup fails
            console.warn("[afterEach] cleanup skipped:", e?.message ?? e);
        }
    }

    static async saveSnapshotsAndCompare(page: Page, label: string = "default"): Promise<void> {
        // Check if page is still open before trying to access project
        if (page.isClosed()) {
            console.log("[saveSnapshotsAndCompare] Page already closed, skipping snapshot");
            return;
        }

        // Skip if page was never navigated (e.g., tests using browser fixture directly)
        try {
            const url = page.url();
            if (url === "about:blank" || url === "") {
                console.log("[saveSnapshotsAndCompare] Page not initialized, skipping snapshot");
                return;
            }
        } catch {
            console.log("[saveSnapshotsAndCompare] Page not accessible, skipping snapshot");
            return;
        }

        // Wait for the project to be available in the store with a shorter timeout
        try {
            await page.waitForFunction(() => {
                const store = (window as any).generalStore || (window as any).appStore;
                return !!(store && store.project);
            }, { timeout: 10000 });
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            // Don't warn for expected cancellation scenarios
            if (msg.includes("Test ended") || msg.includes("Page closed") || msg.includes("context was destroyed")) {
                console.log("[saveSnapshotsAndCompare] Test ended before snapshot, skipping");
            } else {
                console.warn("[saveSnapshotsAndCompare] waitForFunction failed:", msg);
            }
            return; // Skip snapshot if project is not available
        }

        // Check again if page is still open before evaluating
        if (page.isClosed()) {
            console.log("[saveSnapshotsAndCompare] Page already closed, skipping snapshot");
            return;
        }

        // Build a minimal snapshot directly from the app store on the page
        let result;
        try {
            result = await page.evaluate(async () => {
                function yTextToString(t: any): string {
                    if (!t) return "";
                    try {
                        return typeof t.toString === "function" ? t.toString() : String(t);
                    } catch {
                        return String(t);
                    }
                }

                const store = (window as any).generalStore || (window as any).appStore;
                if (!store || !store.project) {
                    throw new Error("Project not available on window.generalStore/appStore");
                }

                const project = store.project;
                const pages: Array<{ title: string; items: Array<{ text: string; }>; }> = [];

                // project.items is proxied array-like; iterate by length
                const len = (project.items as any)?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const pageItem = (project.items as any).at(i);
                    if (!pageItem) continue;
                    const pageTitle = yTextToString(pageItem.text);
                    const children: Array<{ text: string; }> = [];
                    const clen = (pageItem.items as any)?.length ?? 0;
                    for (let j = 0; j < clen; j++) {
                        const child = (pageItem.items as any).at(j);
                        if (!child) continue;
                        children.push({ text: yTextToString(child.text) });
                    }
                    // First item is the page title by convention (legacy snapshotter alignment)
                    pages.push({ title: pageTitle, items: [{ text: pageTitle }, ...children] });
                }

                return {
                    mode: "yjs",
                    yjsJson: JSON.stringify({ projectTitle: String(project.title ?? ""), pages }, null, 2),
                };
            }, { timeout: 30000 });
        } catch (e) {
            console.warn("[saveSnapshotsAndCompare] evaluate failed:", e?.message ?? e);
            return; // Skip snapshot if evaluation fails
        }

        const path = await import("path");
        const fsPromises = await import("fs/promises");
        // Write snapshots in the client directory to match test expectations
        const outDir = path.resolve(process.cwd(), "e2e-snapshots");
        await fsPromises.mkdir(outDir, { recursive: true }).catch(() => {});
        const yjsPath = path.join(outDir, `${label}-yjs.json`);
        if (!result.yjsJson) throw new Error("Yjs snapshot missing");
        await fsPromises.writeFile(yjsPath, result.yjsJson);
        console.log(`Saved Yjs snapshot: ${yjsPath}`);
    }
}
