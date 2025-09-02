import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Comments, Item, Items, Project, Tree } from "./app-schema";

// 厳密な期待値でY.Textのラップ動作を検証

describe("app-schema (Yjs unified)", () => {
    it("Item.text は Y.Text の内容と常に一致し、setter は全置換する", () => {
        const ytext = new Y.Text();
        ytext.insert(0, "hello");
        const item = new Item({ text: ytext, author: "u" });
        expect(item.text).toBe("hello");

        // setter 経由の全置換
        item.text = "world";
        expect(item.text).toBe("world");
        expect(ytext.toString()).toBe("world");
    });

    it("constructorのstring引数でもY.Textへ格納される", () => {
        const item = new Item({ text: "abc", author: "u" });
        expect(item.text).toBe("abc");
        // 直接Y.Textを参照可能
        expect(item.yText.toString()).toBe("abc");
    });

    it("updateText は setter を用いて lastChanged を更新する", () => {
        const item = new Item({ text: "a", author: "u" });
        const before = item.lastChanged;
        item.updateText("b");
        expect(item.text).toBe("b");
        expect(item.lastChanged).toBeGreaterThanOrEqual(before);
    });

    it("Items.addNode は Item を返し、text/author を設定する", () => {
        const items = new Items();
        const n = items.addNode("me", "title");
        expect(n.text).toBe("title");
        expect(n.author).toBe("me");
        expect(items.includes(n)).toBe(true);
    });

    it("Project.addPage は Page 相当のItemを追加し、title を設定する", () => {
        const project = new Project({ title: "P" });
        const page = project.addPage("PageTitle", "user");
        expect(page.text).toBe("PageTitle");
        expect(project.items.includes(page)).toBe(true);
    });

    it("Tree.is はインスタンス判定に対応する（互換目的）", () => {
        const project = new Project({ title: "P" });
        expect(Tree.is(project, Project)).toBe(true);
    });
});
