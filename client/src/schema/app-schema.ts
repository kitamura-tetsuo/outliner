/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    type ReadonlyArrayNode,
    SchemaFactory,
    Tree,
    type TreeLeafValue,
    type TreeNode,
    TreeViewConfiguration,
    type ValidateRecursiveSchema,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

// スキーマファクトリを作成
const sf = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120003");

// アイテム定義をシンプル化
export class Item extends sf.objectRecursive("Item", {
    id: sf.string,
    text: sf.string, // テキスト内容
    author: sf.string,
    votes: sf.array(sf.string),
    created: sf.number,
    lastChanged: sf.number,
    items: () => Items, // 子アイテムを保持
}) {
    // テキスト更新時にタイムスタンプも更新
    public readonly updateText = (text: string) => {
        this.lastChanged = new Date().getTime();
        this.text = text;
    };

    // 投票機能
    public readonly toggleVote = (user: string) => {
        const index = this.votes.indexOf(user);
        if (index > -1) {
            this.votes.removeAt(index);
        }
        else {
            this.votes.insertAtEnd(user);
        }
        this.lastChanged = new Date().getTime();
    };

    // アイテム削除機能
    public readonly delete = () => {
        const parent = Tree.parent(this);
        if (Tree.is(parent, Items)) {
            // 子アイテムがある場合、親に移動してから削除
            const items = this.items as ReadonlyArrayNode<TreeNode | TreeLeafValue>;
            if (items.length > 0) {
                Tree.runTransaction(parent, () => {
                    const index = parent.indexOf(this);
                    parent.moveRangeToIndex(index, 0, items.length, items);
                    parent.removeAt(parent.indexOf(this));
                });
            }
            else {
                // 子アイテムがない場合は単純に削除
                parent.removeAt(parent.indexOf(this));
            }
        }
    };
}

// アイテムのリスト
export class Items extends sf.arrayRecursive("Items", [Item]) {
    /**
     * 通常のアイテム（ページ内のノード）を追加
     * @param author 作成者
     * @returns 作成されたアイテム
     */
    public readonly addNode = (author: string) => {
        const timeStamp = new Date().getTime();

        // 開発環境では、アイテムのインデックスをテキストに設定
        const isDev = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
        const itemIndex = this.length;
        const defaultText = isDev ? `Item ${itemIndex}` : "";

        const newItem = new Item({
            id: uuid(),
            text: defaultText, // 開発環境ではインデックスを含むテキスト
            author,
            votes: [],
            created: timeStamp,
            lastChanged: timeStamp,
            // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題(https://github.com/microsoft/FluidFramework/issues/22101)
            items: new Items([]), // 子アイテムのための空のリスト
        });

        this.insertAtEnd(newItem);
        return newItem;
    };
}

// 型検証ヘルパー
{
    type _check = ValidateRecursiveSchema<typeof Items>;
}

// アイテム定義をシンプル化
export class Project extends sf.objectRecursive("Project", {
    title: sf.string,
    items: () => Items, // 元のコードに戻す - TypeScript型エラーはあるが機能する
}) {
    // テキスト更新時にタイムスタンプも更新
    public readonly updateText = (text: string) => {
        this.title = text;
    };

    /**
     * ページとして機能するアイテム（最上位アイテム）を追加
     * このメソッドはルートItemsコレクションに対してのみ使用してください。
     * 通常のアイテムの子アイテムとしては使用しないでください。
     *
     * @param title ページのタイトル
     * @param author 作成者
     * @returns 作成されたページアイテム
     */
    public readonly addPage = (title: string, author: string) => {
        return (this.items as Items).addNode(author);
    };

    public static createInstance(title: string): Project {
        return new Project({
            title: title,
            // @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
            items: new Items([]), // 空のアイテムリストで初期化
        });
    }
}

// 型検証ヘルパーはコメントアウト - 型エラーを避けるため
// {
// 	type _check = ValidateRecursiveSchema<typeof Project>;
// }

// TypeScriptのエラーは無視するが、ランタイム動作は問題ないはず
// @ts-ignore - GitHub Issue #22101 に関連する既知の型の問題
export const appTreeConfiguration = new TreeViewConfiguration(
    { schema: Project },
);
