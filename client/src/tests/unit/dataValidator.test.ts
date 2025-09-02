import { describe, expect, it } from "vitest";
import { DataValidator } from "../../lib/dataValidation";

// Minimal Fluid page/item types for tests
interface FluidItem {
    id: string;
    text: string;
    items?: FluidItem[];
}

interface YjsItem {
    id: string;
    text: string;
    children?: YjsItem[];
}

type YjsPageManagerStub = {
    getRootItems: () => YjsItem[];
    getChildren: (id: string) => YjsItem[];
};

describe("DataValidator.validatePageItems", () => {
    function buildYjsStubs(rootItems: YjsItem[]): { pageManager: YjsPageManagerStub; } {
        const index: Record<string, YjsItem> = {};
        const add = (it: YjsItem) => {
            index[it.id] = it;
            (it.children || []).forEach(add);
        };
        rootItems.forEach(add);

        const pageManager: YjsPageManagerStub = {
            getRootItems: () => rootItems.map(({ id, text, children }) => ({ id, text, children })),
            getChildren: (id: string) => {
                const node = index[id];
                return (node?.children || []).map(({ id, text, children }) => ({ id, text, children }));
            },
        };
        return { pageManager };
    }

    const yjsProjectManagerStub = (pageManager: YjsPageManagerStub) => ({
        async connectToPage(_pageId: string) {
            return pageManager as any;
        },
    });

    it("タイトルノードは比較対象から除外し、タイトル直下の子のみを比較する", async () => {
        // Fluid: ページ配下の子2件
        const fluidPage: FluidItem = {
            id: "page1",
            text: "My Page",
            items: [
                { id: "f1", text: "A" },
                { id: "f2", text: "B" },
            ],
        };

        // Yjs: ルートにタイトルノードと子2件
        const { pageManager } = buildYjsStubs([
            {
                id: "y_title",
                text: "My Page",
                children: [
                    { id: "y1", text: "A" },
                    { id: "y2", text: "B" },
                ],
            },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "My Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        // 2件分が一致
        expect(res.length).toBe(2);
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
    });

    it("タイトル直下に子が無い場合は、同階層のルート直下（タイトル以外）を比較対象にする", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Title",
            items: [
                { id: "f1", text: "X" },
                { id: "f2", text: "Y" },
            ],
        };

        // Yjs: ルートにタイトルのみ（子なし）と、同階層にX, Y
        const { pageManager } = buildYjsStubs([
            { id: "t", text: "Title" },
            { id: "x", text: "X" },
            { id: "y", text: "Y" },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Title" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(2);
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
    });

    it("Fluidに末尾の空行がある場合、Yjsに不足分があれば不一致として検出する（スナップショット補完対象の前提確認）", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "P",
            items: [
                { id: "f1", text: "A" },
                { id: "f2", text: "B" },
                { id: "f3", text: "" }, // 末尾の空行相当
            ],
        };

        // Yjs: タイトルの子は A, B のみ（空行不足）
        const { pageManager } = buildYjsStubs([
            {
                id: "title",
                text: "P",
                children: [
                    { id: "y1", text: "A" },
                    { id: "y2", text: "B" },
                ],
            },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "P" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(3);
        // 先頭2件は一致
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
        // 3件目はYjs側が不足のため不一致
        expect(res[2].matches).toBe(false);
        expect(res[2].differences.some(d => d.includes("Yjs item missing at index 2"))).toBe(true);
    });

    it("IDは独立システムのため差異は警告に留まり、text一致ならmatchesはtrueになる", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Page",
            items: [{ id: "f1", text: "Same" }],
        };

        const { pageManager } = buildYjsStubs([
            { id: "title", text: "Page", children: [{ id: "y-other", text: "Same" }] },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(1);
        expect(res[0].matches).toBe(true);
        // 差異一覧にはID mismatchの警告は含まれない（differencesは重要差異のみ）
        expect(res[0].differences.length).toBe(0);
    });

    it("テキスト内容が異なる場合は厳密に不一致として検出する", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Page",
            items: [
                { id: "f1", text: "Hello" },
                { id: "f2", text: "World" },
            ],
        };

        const { pageManager } = buildYjsStubs([
            {
                id: "title",
                text: "Page",
                children: [
                    { id: "y1", text: "Hello" },
                    { id: "y2", text: "Universe" }, // 異なるテキスト
                ],
            },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(2);
        expect(res[0].matches).toBe(true); // "Hello" は一致
        expect(res[1].matches).toBe(false); // "World" vs "Universe" は不一致
        expect(res[1].differences.some(d => d.includes('Text mismatch: Fluid="World", Yjs="Universe"'))).toBe(true);
    });

    it("アイテム数が異なる場合（Fluid多い）は不足分を不一致として検出する", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Page",
            items: [
                { id: "f1", text: "A" },
                { id: "f2", text: "B" },
                { id: "f3", text: "C" }, // Yjsにはない
            ],
        };

        const { pageManager } = buildYjsStubs([
            {
                id: "title",
                text: "Page",
                children: [
                    { id: "y1", text: "A" },
                    { id: "y2", text: "B" },
                    // C に対応するアイテムなし
                ],
            },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(3);
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
        expect(res[2].matches).toBe(false); // Yjs側が不足
        expect(res[2].differences.some(d => d.includes("Yjs item missing at index 2"))).toBe(true);
    });

    it("アイテム数が異なる場合（Yjs多い）は余分分を不一致として検出する", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Page",
            items: [
                { id: "f1", text: "A" },
                { id: "f2", text: "B" },
            ],
        };

        const { pageManager } = buildYjsStubs([
            {
                id: "title",
                text: "Page",
                children: [
                    { id: "y1", text: "A" },
                    { id: "y2", text: "B" },
                    { id: "y3", text: "C" }, // Fluidにはない
                ],
            },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(3);
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
        expect(res[2].matches).toBe(false); // Fluid側が不足
        expect(res[2].differences.some(d => d.includes("Fluid item missing at index 2"))).toBe(true);
    });

    it("空のページ（アイテムなし）の場合は正常に処理される", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Empty Page",
            items: [],
        };

        const { pageManager } = buildYjsStubs([
            { id: "title", text: "Empty Page", children: [] },
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Empty Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(0); // アイテムがないので比較結果も空
    });

    it("複雑な階層構造でもタイトルノード配下の子のみを正確に比較する", async () => {
        const fluidPage: FluidItem = {
            id: "page1",
            text: "Complex Page",
            items: [
                { id: "f1", text: "Item 1" },
                { id: "f2", text: "Item 2" },
                { id: "f3", text: "Item 3" },
            ],
        };

        // Yjs: ルートに複数アイテムがあるが、タイトル配下の子のみを比較対象とする
        const { pageManager } = buildYjsStubs([
            { id: "other1", text: "Other Root Item" }, // これは比較対象外
            {
                id: "title",
                text: "Complex Page",
                children: [
                    { id: "y1", text: "Item 1" },
                    { id: "y2", text: "Item 2" },
                    { id: "y3", text: "Item 3" },
                ],
            },
            { id: "other2", text: "Another Root Item" }, // これも比較対象外
        ]);

        const res = await DataValidator.validatePageItems(
            fluidPage as any,
            { id: "page1", title: "Complex Page" },
            yjsProjectManagerStub(pageManager) as any,
            undefined,
        );

        expect(res.length).toBe(3);
        expect(res[0].matches).toBe(true);
        expect(res[1].matches).toBe(true);
        expect(res[2].matches).toBe(true);
        // すべてのアイテムが一致することを確認
        expect(res.every(r => r.matches)).toBe(true);
    });
});
