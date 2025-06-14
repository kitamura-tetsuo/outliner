// src/types/fluid-framework.d.ts
import "fluid-framework";
import "fluid-framework/alpha";
import type {
    Items,
    Project,
} from "../schema/app-schema";

declare module "fluid-framework" {
    // ← ジェネリックは１つだけ宣言する
    interface TreeView<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema> {
        // Project のときだけ items: Items を正しく補完
        readonly root: TSchema extends typeof Project ? Project & { items: Items; }
            // その他は元来の型に戻す
            : import("fluid-framework").TreeView<TSchema>["root"];
    }
}

declare module "fluid-framework/alpha" {
    // Alpha APIの型定義を拡張
    interface TreeBranch {
        // 追加のメソッドがあれば定義
    }
}
