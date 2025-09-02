import { expect, test } from "vitest";
import { YjsProjectManager } from "../../lib/yjsProjectManager.svelte";

// Yjsの基本APIがユニットテスト環境で動作することを確認
// ネットワークに依存しない（IndexedDBとローカルDocのみ）

test("yjs: can create project and page without network", async () => {
    const projectId = `ut-yjs-${Date.now()}`;
    const mgr = new YjsProjectManager(projectId);
    await mgr.connect("ユニットテスト");

    const pid = await mgr.createPage("Page-1", "tester", ["a", "b"]);
    expect(typeof pid).toBe("string");

    const pageItem = await mgr.getPageItem(pid);
    expect(pageItem).not.toBeNull();
    expect(pageItem!.text).toBe("Page-1");
});
