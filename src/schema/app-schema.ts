/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	Tree,
	TreeViewConfiguration,
	type ValidateRecursiveSchema,
} from "fluid-framework";
import { v4 as uuid } from "uuid";

// スキーマファクトリを作成
const sf = new SchemaFactory("fc1db2e8-0a00-11ee-be56-0242ac120002");

// アイテム定義をシンプル化（グループとノートの区別を削除）
export class Item extends sf.objectRecursive("Item", {
	id: sf.string,
	text: sf.string, // テキスト内容のみを保持
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
		} else {
			this.votes.insertAtEnd(user);
		}
		this.lastChanged = new Date().getTime();
	};

	// アイテム削除機能
	public readonly delete = () => {
		const parent = Tree.parent(this);
		if (Tree.is(parent, Items)) {
			// 子アイテムがある場合、親に移動してから削除
			if (this.items.length > 0) {
				Tree.runTransaction(parent, () => {
					const index = parent.indexOf(this);
					parent.moveRangeToIndex(index, 0, this.items.length, this.items);
					parent.removeAt(parent.indexOf(this));
				});
			} else {
				// 子アイテムがない場合は単純に削除
				parent.removeAt(parent.indexOf(this));
			}
		}
	};
}

// アイテムのリスト
export class Items extends sf.arrayRecursive("Items", [Item]) {
	// 新しいアイテムを追加（グループ区別なし）
	public readonly addNode = (author: string) => {
		const timeStamp = new Date().getTime();

		const newItem = new Item({
			id: uuid(),
			text: "",
			author,
			votes: [],
			created: timeStamp,
			lastChanged: timeStamp,
			items: new Items([]), // 空の子アイテムリスト
		});

		this.insertAtEnd(newItem);
		return newItem;
	};
}

// 型検証ヘルパー
{
	type _check = ValidateRecursiveSchema<typeof Items>;
}

// TreeView構成をエクスポート
export const appTreeConfiguration = new TreeViewConfiguration(
	{ schema: Items },
);