import { Tree } from "fluid-framework";
import {
    Item,
    Items,
    Project,
} from "../schema/app-schema";

/**
 * TreeViewに関するヘルパー関数を提供するクラス
 */
export class TreeViewManager {
    /**
     * 新しいページをルートアイテムコレクションに追加する
     * @param rootItems ルートのItemsコレクション
     * @param title ページタイトル
     * @param author 作成者
     * @returns 作成されたページアイテム
     */
    public static addPage(project: Project, title: string, author: string): Item {
        // ルートItemsコレクションにのみページを追加
        return project.addPage(title, author);
    }

    /**
     * 特定のアイテムがルートレベルのページであるかを判定
     * @param item 判定するアイテム
     * @returns ルートレベルのページである場合true
     */
    public static isPageItem(item: Item): boolean {
        // 親がItemsで、その親がnull（ルート）である場合はページ
        const parent = Tree.parent(item);
        return Tree.is(parent, Items) && Tree.parent(parent) === null;
    }

    /**
     * ページIDからページアイテムを検索
     * @param rootItems ルートアイテムコレクション
     * @param pageId 検索するページID
     * @returns 見つかったページ、または未発見時はnull
     */
    public static findPageById(rootItems: Items, pageId: string): Item | null {
        for (const page of rootItems) {
            if (page.id === pageId) {
                return page;
            }
        }
        return null;
    }
}
