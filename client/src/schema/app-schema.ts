// Yjsモード専用のスキーマ定義
// Fluidライブラリに依存しない実装

import { v4 as uuid } from "uuid";
import * as Y from "yjs";

// Yjsモード専用のコメントクラス
export class Comment {
    public id: string;
    public text: string;
    public author: string;
    public created: number;
    public lastChanged: number;

    constructor(data: {
        id?: string;
        text: string;
        author: string;
        created?: number;
        lastChanged?: number;
    }) {
        this.id = data.id || uuid();
        this.text = data.text;
        this.author = data.author;
        this.created = data.created || new Date().getTime();
        this.lastChanged = data.lastChanged || new Date().getTime();
    }

    public readonly updateText = (text: string) => {
        this.lastChanged = new Date().getTime();
        this.text = text;
    };
}

// Yjsモード専用のコメント配列クラス
export class Comments extends Array<Comment> {
    public readonly addComment = (author: string, text: string) => {
        const time = new Date().getTime();
        const comment = new Comment({
            id: uuid(),
            text,
            author,
            created: time,
            lastChanged: time,
        });
        this.push(comment);
        return comment;
    };

    public readonly deleteComment = (commentId: string) => {
        const idx = this.findIndex(c => c.id === commentId);
        if (idx > -1) {
            this.splice(idx, 1);
        }
    };

    public readonly updateComment = (commentId: string, text: string) => {
        const c = this.find(cm => cm.id === commentId);
        if (c) c.updateText(text);
    };
}

// Yjsモード専用のアイテムクラス
export class Item {
    public id: string;
    private _yText: Y.Text;
    private _yDoc?: Y.Doc; // 一時的にアタッチするDoc（単体利用時の安全性確保）
    private _textCache: string = "";
    public get yText(): Y.Text {
        return this._yText;
    }
    // 互換レイヤ: string としての text にアクセス/代入できるようにする
    public get text(): string {
        return this._textCache;
    }
    public set text(value: string) {
        // 全置換（Y.Textの内容を文字列で置換）
        this._yText.delete(0, this._yText.length);
        if (value) this._yText.insert(0, value);
        this._textCache = value || "";
        this.lastChanged = new Date().getTime();
    }
    public author: string;
    public votes: string[];
    public attachments?: string[];
    public created: number;
    public componentType?: string;
    public aliasTargetId?: string;
    public lastChanged: number;
    public items: Items;
    public comments: Comments;

    constructor(data: {
        id?: string;
        text: string | Y.Text;
        author: string;
        votes?: string[];
        attachments?: string[];
        created?: number;
        componentType?: string;
        aliasTargetId?: string;
        lastChanged?: number;
    }) {
        this.id = data.id || uuid();
        // text 初期化（Y.Textを内部に保持）
        if (data.text instanceof Y.Text) {
            this._yText = data.text;
            // 未アタッチのY.Textは読み取り時に例外を投げる環境があるため、一時Docへアタッチ
            // @ts-ignore - access internal doc reference
            const hasDoc = !!(this._yText as any).doc;
            if (!hasDoc) {
                this._yDoc = new Y.Doc();
                const tmp = this._yDoc.getMap("tmp");
                tmp.set("text", this._yText);
            }
            try {
                this._textCache = this._yText.toString();
            } catch {
                this._textCache = "";
            }
        } else {
            this._yText = new Y.Text();
            // 一時Docへアタッチしてから初期値を設定
            this._yDoc = new Y.Doc();
            const tmp = this._yDoc.getMap("tmp");
            tmp.set("text", this._yText);
            const initial = (data.text ?? "").toString();
            if (initial) this._yText.insert(0, initial);
            this._textCache = initial;
        }
        this.author = data.author;
        this.votes = data.votes || [];
        this.attachments = data.attachments;
        this.created = data.created || new Date().getTime();
        this.componentType = data.componentType;
        this.aliasTargetId = data.aliasTargetId;
        this.lastChanged = data.lastChanged || new Date().getTime();
        this.items = new Items();
        this.comments = new Comments();
    }

    // テキスト更新時にタイムスタンプも更新
    public readonly updateText = (text: string) => {
        console.log(`[updateText] Item ${this.id}: updating text from "${this.text}" to "${text}"`);
        this.text = text;
    };

    // 投票機能
    public readonly toggleVote = (user: string) => {
        const index = this.votes.indexOf(user);
        if (index > -1) {
            this.votes.splice(index, 1);
        } else {
            this.votes.push(user);
        }
        this.lastChanged = new Date().getTime();
    };

    // 添付ファイルを追加
    public readonly addAttachment = (attachmentId: string) => {
        if (!this.attachments) {
            this.attachments = [];
        }
        this.attachments.push(attachmentId);
        this.lastChanged = new Date().getTime();
    };

    // コメント機能（Fluid互換のラッパー）
    public readonly addComment = (author: string, text: string) => {
        return this.comments.addComment(author, text);
    };
    public readonly deleteComment = (commentId: string) => {
        return this.comments.deleteComment(commentId);
    };
    public readonly updateComment = (commentId: string, text: string) => {
        return this.comments.updateComment(commentId, text);
    };

    // 削除機能
    public readonly delete = () => {
        // Yjsモードでは親から削除する必要がある
        console.log(`[delete] Item ${this.id}: delete requested`);
        // 実際の削除は親のItemsクラスで処理される
    };
}

// Yjsモード専用のアイテム配列クラス
export class Items extends Array<Item> {
    public readonly addNode = (author: string, text: string = "新しいアイテム") => {
        const item = new Item({
            text,
            author,
        });
        this.push(item);
        return item;
    };

    public readonly removeAt = (index: number) => {
        if (index >= 0 && index < this.length) {
            this.splice(index, 1);
        }
    };

    public readonly insertAtEnd = (item: Item) => {
        this.push(item);
    };

    public readonly moveToIndex = (item: Item, newIndex: number) => {
        const currentIndex = this.indexOf(item);
        if (currentIndex > -1) {
            this.splice(currentIndex, 1);
            this.splice(newIndex, 0, item);
        }
    };
}

// Yjsモード専用のプロジェクトクラス
export class Project {
    public id: string;
    public title: string;
    public items: Items;
    public created: number;
    public lastChanged: number;

    constructor(data: {
        id?: string;
        title: string;
        created?: number;
        lastChanged?: number;
    }) {
        this.id = data.id || uuid();
        this.title = data.title;
        this.created = data.created || new Date().getTime();
        this.lastChanged = data.lastChanged || new Date().getTime();
        this.items = new Items();
    }

    public readonly updateTitle = (title: string) => {
        this.lastChanged = new Date().getTime();
        this.title = title;
    };

    /**
     * ページ（最上位アイテム）を追加（Fluid互換API）
     */
    public readonly addPage = (title: string, author: string) => {
        const pageItem = (this.items as Items).addNode(author);
        pageItem.updateText(title);
        return pageItem;
    };

    /**
     * プロジェクトのインスタンスを生成（Fluid互換API）
     */
    public static createInstance(title: string): Project {
        return new Project({ title });
    }
}

// Fluid互換: ViewableTree用設定のダミーエクスポート
export const appTreeConfiguration = { schema: Project } as any;

// Tree関連のユーティリティ（Fluid互換性のため）
export const Tree = {
    is: (obj: any, type: any): boolean => {
        // Yjsモードでは常にtrueを返す（型チェックを簡略化）
        return obj instanceof type;
    },
};

// 設定オブジェクト（Fluid互換性のため）
export const treeConfiguration = {
    schema: Project,
};

// 型エクスポート
export type TreeViewConfiguration = any;
export type ValidateRecursiveSchema = any;
export type ReadonlyArrayNode = any;
export type TreeLeafValue = any;
export type TreeNode = any;
