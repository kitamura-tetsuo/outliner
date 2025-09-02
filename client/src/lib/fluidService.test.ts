// @ts-nocheck
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Project } from "../schema/app-schema";
import { YjsProjectManager } from "./yjsProjectManager.svelte";
import { yjsService } from "./yjsService.svelte";

vi.setConfig({ testTimeout: 60000 });

describe("YjsProjectManager", () => {
    beforeAll(async () => {
        process.env.NODE_ENV = "test";
        process.env.VITE_IS_TEST = "true";
        // ネットワークに依存しないようにWebSocket URLを無効ポートに設定
        yjsService.setWebsocketUrl("ws://localhost:0");
    }, 60000);

    it("connects to a project and can create a page with items", async () => {
        const projectId = `test-project-${Date.now()}`;
        const initialTitle = "新規プロジェクト";
        const mgr = new YjsProjectManager(projectId);

        await mgr.connect(initialTitle);

        // Projectオブジェクトが取得できること
        const project: Project | null = mgr.getProject();
        expect(project).not.toBeNull();
        expect(project!.title).toBe(initialTitle);

        // ページを作成できること
        const pageId = await mgr.createPage("PageA", "tester", ["line1", "line2"]);
        expect(typeof pageId).toBe("string");

        // ページのItemを取得して内容を検証
        const pageItem = await mgr.getPageItem(pageId);
        expect(pageItem).not.toBeNull();
        expect(pageItem!.text).toBe("PageA");
        // DataValidator仕様では、ページタイトルがルート直下にあり、その配下にline1/line2が並ぶ
        const rootChildren = (pageItem as any).items as any[];
        expect(rootChildren.length).toBe(1);
        expect(rootChildren[0].text).toBe("PageA");

        // ツリーマネージャ経由でタイトルノード配下の子を検証
        const treeManager = await mgr.connectToPage(pageId);
        const roots = treeManager.getRootItems();
        const titleNode = roots.find(r => r.text === "PageA");
        expect(titleNode).toBeTruthy();
        const titleChildren = treeManager.getChildren(titleNode!.id);
        expect(titleChildren.length).toBe(2);
        expect(titleChildren[0].text).toBe("line1");
        expect(titleChildren[1].text).toBe("line2");
    }, 60000);

    afterEach(() => {
        vi.useRealTimers();
    });
});
