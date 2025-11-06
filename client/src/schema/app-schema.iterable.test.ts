import { describe, expect, it, vi } from "vitest";
import { Item, Project } from "./app-schema";

// モック: Cursor が依存するストアのうち、今回のテストで使用するのは currentPage のみ
vi.mock("../stores/store.svelte", () => ({
    store: {
        currentPage: undefined as unknown as Item | undefined,
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn(),
    },
}));

// 遅延import（vi.mockの後で）
import { Cursor } from "../lib/Cursor";
import { store as generalStore } from "../stores/store.svelte";

describe("Items.asArrayLike iterable characteristics", () => {
    it("supports for..of iteration over Project.items and Item.items", () => {
        const project = Project.createInstance("iterable-test");

        // ルート直下に2ページ相当のアイテムを作成
        const rootItems = project.items;
        const a = rootItems.addNode("user");
        a.updateText("A");
        const b = rootItems.addNode("user");
        b.updateText("B");

        // for..of が動作し、Item インスタンスが列挙されること
        const ids: string[] = [];
        for (const it of rootItems as Iterable<Item>) {
            expect(it).toBeInstanceOf(Item);
            ids.push(it.id);
        }
        expect(ids.length).toBe(rootItems.length);
        expect(new Set(ids).size).toBe(ids.length);

        // 子へも for..of できること
        const child1 = a.items.addNode("user");
        child1.updateText("A-1");
        const child2 = a.items.addNode("user");
        child2.updateText("A-2");

        const childIds: string[] = [];
        for (const ch of a.items as Iterable<Item>) {
            childIds.push(ch.id);
        }
        expect(childIds.length).toBe(2);
    });
});

describe("Cursor.searchItem recursion over children (no exceptions)", () => {
    it("findTarget() locates deep child without throwing", () => {
        const project = Project.createInstance("cursor-search");
        const rootItems = project.items;

        const page = rootItems.addNode("user");
        page.updateText("Page");

        const c1 = page.items.addNode("user");
        c1.updateText("child-1");
        const c2 = page.items.addNode("user");
        c2.updateText("child-2");

        // Cursor が参照する currentPage を設定
        generalStore.currentPage = page;

        const cursor = new Cursor("cur-1", {
            itemId: c2.id,
            offset: 0,
            isActive: true,
            userId: "u1",
        });

        // 例外が出ないこと、および見つかること
        let found: Item | undefined;
        expect(() => {
            found = cursor.findTarget();
        }).not.toThrow();
        expect(found?.id).toBe(c2.id);
    });
});
