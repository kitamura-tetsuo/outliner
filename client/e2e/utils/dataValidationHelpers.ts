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
            const labelBase = testInfo.title.replace(/[^a-z0-9_-]+/gi, "-");
            const label = `${labelBase}-auto-${Date.now()}`;
            await DataValidationHelpers.saveSnapshotsAndCompare(page, label);
        } catch (e: any) {
            // Do not fail the test if snapshot saving fails
            console.warn("[afterEach] snapshot skipped:", e?.message ?? e);
        } finally {
            // Dump E2E logs if present
            try {
                const logs = await page.evaluate(() => {
                    const w: any = window as any;
                    return Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS.slice(-200) : [];
                });
                if (Array.isArray(logs) && logs.length) {
                    console.log("[afterEach] E2E_LOGS (last 200):", logs);
                }
            } catch {}
        }
    }
    static async saveSnapshotsAndCompare(page: Page, label: string = "default"): Promise<void> {
        // Build a minimal snapshot directly from the app store on the page
        const result = await page.evaluate(async () => {
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
        });

        const path = await import("path");
        const fsPromises = await import("fs/promises");
        // Write snapshots outside the Vite root to avoid dev server reloads
        const outDir = path.resolve(process.cwd(), "..", "e2e-snapshots");
        await fsPromises.mkdir(outDir, { recursive: true }).catch(() => {});
        const yjsPath = path.join(outDir, `${label}-yjs.json`);
        if (!result.yjsJson) throw new Error("Yjs snapshot missing");
        await fsPromises.writeFile(yjsPath, result.yjsJson);
        console.log(`Saved Yjs snapshot: ${yjsPath}`);
    }
}
