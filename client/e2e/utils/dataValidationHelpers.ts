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

            const labelBase = testInfo.title.replace(/[^a-z0-9_-]+/gi, "-");
            const label = `${labelBase}-auto-${Date.now()}`;
            await DataValidationHelpers.saveSnapshotsAndCompare(page, label);
        } catch (e) {
            // Do not fail the test if snapshot saving fails
            console.warn("[afterEach] snapshot skipped:", e instanceof Error ? e.message : String(e));
        } finally {
            try {
                // Check if page is still open before trying to dump logs
                if (!page.isClosed()) {
                    // Dump E2E logs if present
                    const logs = await page.evaluate(() => {
                        const w = window as unknown as { E2E_LOGS?: unknown[]; };
                        return Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS.slice(-200) : [];
                    }, { timeout: 2000 });
                    if (Array.isArray(logs) && logs.length) {
                        console.log("[afterEach] E2E_LOGS (last 200):", logs);
                    }
                } else {
                    console.log("[afterEach] Page already closed, skipping log dump");
                }
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                // Check if the test has ended - in this case, skip silently
                if (errorMsg.includes("Test ended") || errorMsg.includes("Execution context was destroyed")) {
                    console.log("[afterEach] Test ended, skipping log dump");
                } else {
                    console.warn("[afterEach] log dump skipped:", errorMsg);
                }
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
                    const w = window as unknown as {
                        E2E_LOGS?: unknown[];
                        generalStore?: unknown;
                        editorOverlayStore?: unknown;
                        aliasPickerStore?: unknown;
                        commandPaletteStore?: unknown;
                        userPreferencesStore?: unknown;
                        searchHistoryStore?: unknown;
                    };
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
            }, { timeout: 2000 }).catch((e) => {
                const errorMsg = e instanceof Error ? e.message : String(e);
                // Check if the test has ended - in this case, skip silently
                if (errorMsg.includes("Test ended") || errorMsg.includes("Execution context was destroyed")) {
                    console.log("[afterEach] Test ended, skipping cleanup evaluation");
                } else {
                    // Ignore other errors during cleanup evaluation
                    console.log("[afterEach] cleanup evaluation skipped:", errorMsg);
                }
            });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            // Check if the test has ended - in this case, skip silently
            if (errorMsg.includes("Test ended") || errorMsg.includes("Execution context was destroyed")) {
                console.log("[afterEach] Test ended, skipping cleanup");
            } else {
                // Do not fail the test if cleanup fails
                console.warn("[afterEach] cleanup skipped:", errorMsg);
            }
        }
    }

    static async saveSnapshotsAndCompare(page: Page, label: string = "default"): Promise<void> {
        // Check if page is still open before trying to access project
        if (page.isClosed()) {
            console.log("[saveSnapshotsAndCompare] Page already closed, skipping snapshot");
            return;
        }

        // Wait for the project to be available in the store
        try {
            await page.waitForFunction(() => {
                const w = window as unknown as {
                    generalStore?: { project?: unknown; };
                    appStore?: { project?: unknown; };
                };
                const store = w.generalStore || w.appStore;
                return !!(store && store.project);
            }, { timeout: 2000, polling: 100 });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            // Check if the test has ended - in this case, skip silently
            if (errorMsg.includes("Test ended") || errorMsg.includes("Execution context was destroyed")) {
                console.log("[saveSnapshotsAndCompare] Test ended, skipping snapshot");
                return;
            }
            console.warn("[saveSnapshotsAndCompare] waitForFunction failed:", errorMsg);
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
                function yTextToString(t: unknown): string {
                    if (!t) return "";
                    try {
                        return typeof (t as { toString?: () => string; }).toString === "function"
                            ? (t as { toString: () => string; }).toString()
                            : String(t);
                    } catch {
                        return String(t);
                    }
                }

                const w = window as unknown as {
                    generalStore?: { project?: unknown; };
                    appStore?: { project?: unknown; };
                };
                const store = w.generalStore || w.appStore;
                if (!store || !store.project) {
                    throw new Error("Project not available on window.generalStore/appStore");
                }

                const project = store.project as { items?: { length?: number; at?: (i: number) => unknown; }; };
                const pages: Array<{ title: string; items: Array<{ text: string; }>; }> = [];

                // project.items is proxied array-like; iterate by length
                const len = project.items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const pageItem = project.items?.at(i);
                    if (!pageItem) continue;
                    const pageItemObj = pageItem as {
                        text?: unknown;
                        items?: { length?: number; at?: (j: number) => unknown; };
                    };
                    const pageTitle = yTextToString(pageItemObj.text);
                    const children: Array<{ text: string; }> = [];
                    const clen = pageItemObj.items?.length ?? 0;
                    for (let j = 0; j < clen; j++) {
                        const child = pageItemObj.items?.at(j);
                        if (!child) continue;
                        const childObj = child as { text?: unknown; };
                        children.push({ text: yTextToString(childObj.text) });
                    }
                    // First item is the page title by convention (legacy snapshotter alignment)
                    pages.push({ title: pageTitle, items: [{ text: pageTitle }, ...children] });
                }

                return {
                    mode: "yjs",
                    yjsJson: JSON.stringify({ projectTitle: String(project.title ?? ""), pages }, null, 2),
                };
            }, { timeout: 2000 });
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            // Check if the test has ended - in this case, skip silently
            if (errorMsg.includes("Test ended") || errorMsg.includes("Execution context was destroyed")) {
                console.log("[saveSnapshotsAndCompare] Test ended, skipping snapshot");
                return;
            }
            console.warn("[saveSnapshotsAndCompare] evaluate failed:", errorMsg);
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
