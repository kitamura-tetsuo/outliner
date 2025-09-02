import { describe, expect, it } from "vitest";
import { YjsProjectManager } from "../lib/yjsProjectManager.svelte";
import { store } from "./store.svelte";

// FluidStoreのテストをYjs前提に置き換え。
// store.project が YjsProjectManager により初期化されることのみ確認。

describe("store (Yjs)", () => {
    it("project can be set via YjsProjectManager", async () => {
        const mgr = new YjsProjectManager(`store-yjs-${Date.now()}`);
        await mgr.connect("Test");
        const project = mgr.getProject();
        expect(project?.title).toBe("Test");
    });
});
