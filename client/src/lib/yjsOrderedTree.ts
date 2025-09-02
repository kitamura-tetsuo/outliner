// yjs-orderedtree を使ったアウトライン操作管理
import { v4 as uuid } from "uuid";
import { Doc as YDoc, Map as YMap } from "yjs";
import { checkForYTree, YTree } from "yjs-orderedtree";
import { getLogger } from "./logger";

const logger = getLogger();

export interface OutlineItem {
    id: string;
    text: string;
    author: string;
    created: number;
    lastChanged: number;
    comments?: OutlineComment[];
    votes?: OutlineVote[];
}

export interface OutlineComment {
    id: string;
    text: string;
    author: string;
    created: number;
    lastChanged: number;
}

export interface OutlineVote {
    id: string;
    author: string;
    created: number;
    type: "up" | "down";
}

/**
 * Yjs OrderedTree を使ったアウトライン管理クラス
 */
export class YjsOrderedTreeManager {
    private doc: YDoc;
    private tree: YTree;
    private yMap: YMap<any>;
    private mapKey: string;
    private updateListeners = new Set<() => void>();
    private _yObserver?: (events?: unknown, transaction?: unknown) => void;

    private notifyUpdate() {
        for (const cb of this.updateListeners) {
            try {
                cb();
            } catch (e) {
                logger.warn("YjsOrderedTreeManager update listener error", e as any);
            }
        }
    }

    constructor(doc: YDoc, mapKey: string = "outline") {
        this.doc = doc;
        this.mapKey = mapKey;

        // Y.Mapを取得または作成
        this.yMap = doc.getMap(mapKey);

        // YTreeを初期化
        this.tree = new YTree(this.yMap);

        // Y.Mapの変更を監視して購読者へ通知
        this._yObserver = () => {
            this.notifyUpdate();
        };
        // @ts-ignore - yjs typings for observe accept (event, tx)
        this.yMap.observe(this._yObserver as any);

        logger.info(`YjsOrderedTreeManager initialized with mapKey: ${mapKey}`);
    }

    /**
     * 新しいアイテムを挿入
     */
    insertItem(
        text: string,
        author: string,
        parentId?: string,
        afterItemId?: string,
        customItemId?: string,
    ): string {
        const itemId = customItemId || this.tree.generateNodeKey();
        const now = Date.now();

        const itemData: OutlineItem = {
            id: itemId,
            text,
            author,
            created: now,
            lastChanged: now,
            comments: [],
            votes: [],
        };

        try {
            const parentKey = parentId || "root";

            // まずアイテムを作成
            this.tree.createNode(parentKey, itemId, itemData);
            logger.info(`Item created: ${itemId} under parent: ${parentKey}`);

            if (afterItemId) {
                // 明示された位置: 指定されたアイテムの後に配置
                try {
                    this.tree.setNodeAfter(itemId, afterItemId);
                    logger.info(`Item positioned after ${afterItemId}: ${itemId}`);
                } catch (positionError) {
                    logger.warn(`Failed to position item ${itemId} after ${afterItemId}:`, positionError);
                }
            } else {
                // 位置未指定: 親の末尾に配置（表示順を安定化）
                try {
                    const siblings = this.tree.getNodeChildrenFromKey(parentKey);
                    // yjs-orderedtree の内部順序で安定化
                    const ordered = this.tree.sortChildrenByOrder(siblings, parentKey);
                    // 自分自身を除いた兄弟の最後を取得
                    const orderedWithoutSelf = ordered.filter((k) => k !== itemId);
                    if (orderedWithoutSelf.length > 0) {
                        const lastSibling = orderedWithoutSelf[orderedWithoutSelf.length - 1];
                        this.tree.setNodeAfter(itemId, lastSibling);
                        logger.info(`Item positioned at end after ${lastSibling}: ${itemId}`);
                    }
                } catch (positionError) {
                    logger.warn(`Failed to position item ${itemId} at end:`, positionError);
                }
            }

            logger.info(`Item inserted: ${itemId} under parent: ${parentKey}`);
            // 明示的に通知（即時反映安定化）
            this.notifyUpdate();
            return itemId;
        } catch (error) {
            logger.error("Failed to insert item:", error);
            throw error;
        }
    }

    /**
     * アイテムを移動
     */
    moveItem(itemId: string, newParentId?: string): void {
        try {
            const parentKey = newParentId || "root";
            this.tree.moveChildToParent(itemId, parentKey);

            logger.info(`Item moved: ${itemId} to parent: ${parentKey}`);
        } catch (error) {
            logger.error("Failed to move item:", error);
            throw error;
        }
    }

    /**
     * ルートレベルのアイテム一覧を取得
     */
    getRootItems(): OutlineItem[] {
        try {
            // yjs-orderedtreeライブラリの正しいAPIを使用
            const rootChildren = this.tree.getNodeChildrenFromKey("root");
            const items: OutlineItem[] = [];

            if (rootChildren && Array.isArray(rootChildren)) {
                // 順序を正しく取得するためにsortChildrenByOrderを使用
                const sortedChildren = this.tree.sortChildrenByOrder(rootChildren, "root");

                for (const childId of sortedChildren) {
                    const itemData = this.tree.getNodeValueFromKey(childId);
                    if (itemData) {
                        items.push(itemData as OutlineItem);
                    }
                }
            }

            return items;
        } catch (error) {
            logger.error("Failed to get root items:", error);
            return [];
        }
    }

    /**
     * アイテムを削除
     */
    removeItem(itemId: string): void {
        try {
            this.tree.deleteNodeAndDescendants(itemId);
            logger.info(`Item removed: ${itemId}`);
        } catch (error) {
            logger.error("Failed to remove item:", error);
            throw error;
        }
    }

    /**
     * アイテムのテキストを更新
     */
    updateItemText(itemId: string, newText: string): void {
        try {
            const currentValue = this.tree.getNodeValueFromKey(itemId) as OutlineItem;
            if (currentValue) {
                const updatedData: OutlineItem = {
                    ...currentValue,
                    text: newText,
                    lastChanged: Date.now(),
                };
                this.tree.setNodeValueFromKey(itemId, updatedData);
                logger.info(`Item text updated: ${itemId}`);
                // 明示的に通知（即時反映安定化）
                this.notifyUpdate();
            }
        } catch (error) {
            logger.error("Failed to update item text:", error);
            throw error;
        }
    }

    /**
     * 任意フィールドを部分更新
     */
    updateItem(itemId: string, patch: Partial<Record<string, any>>): void {
        try {
            const currentValue = this.tree.getNodeValueFromKey(itemId) as OutlineItem;
            if (currentValue) {
                const updatedData: OutlineItem = {
                    ...currentValue,
                    ...patch,
                    lastChanged: Date.now(),
                } as OutlineItem;
                this.tree.setNodeValueFromKey(itemId, updatedData);
                logger.info(`Item updated: ${itemId}`);
            }
        } catch (error) {
            logger.error("Failed to update item:", error);
            throw error;
        }
    }

    /**
     * アイテムをインデント（子要素にする）
     */
    indentItem(itemId: string): void {
        try {
            const parentKey = this.tree.getNodeParentFromKey(itemId);
            const siblings = this.tree.getNodeChildrenFromKey(parentKey);

            // 現在のアイテムのインデックスを取得
            const currentIndex = siblings.findIndex(sibling => sibling === itemId);

            if (currentIndex > 0) {
                // 前の兄弟要素の子要素として移動
                const previousSibling = siblings[currentIndex - 1];
                this.moveItem(itemId, previousSibling);

                logger.info(`Item indented: ${itemId} under ${previousSibling}`);
            }
        } catch (error) {
            logger.error("Failed to indent item:", error);
            throw error;
        }
    }

    /**
     * アイテムをアウトデント（親レベルに移動）
     */
    outdentItem(itemId: string): void {
        try {
            const parentKey = this.tree.getNodeParentFromKey(itemId);
            if (parentKey && parentKey !== "root") {
                const grandParentKey = this.tree.getNodeParentFromKey(parentKey);

                if (grandParentKey) {
                    // 祖父母の子要素として移動
                    this.moveItem(itemId, grandParentKey);
                } else {
                    // ルートレベルに移動
                    this.moveItem(itemId, "root");
                }

                logger.info(`Item outdented: ${itemId}`);
            }
        } catch (error) {
            logger.error("Failed to outdent item:", error);
            throw error;
        }
    }

    /**
     * アイテムを上に移動
     */
    moveItemUp(itemId: string): void {
        try {
            const parentKey = this.tree.getNodeParentFromKey(itemId);
            const siblings = this.tree.getNodeChildrenFromKey(parentKey);

            const currentIndex = siblings.findIndex(sibling => sibling === itemId);

            if (currentIndex > 0) {
                const targetSibling = siblings[currentIndex - 1];
                // Fallback: set item after the previous-previous sibling by swapping values
                // If the library supports setNodeBefore in future, replace with that API.
                this.tree.setNodeAfter(targetSibling, itemId);
                logger.info(`Item moved up: ${itemId}`);
            }
        } catch (error) {
            logger.error("Failed to move item up:", error);
            throw error;
        }
    }

    /**
     * アイテムを下に移動
     */
    moveItemDown(itemId: string): void {
        try {
            const parentKey = this.tree.getNodeParentFromKey(itemId);
            const siblings = this.tree.getNodeChildrenFromKey(parentKey);

            const currentIndex = siblings.findIndex(sibling => sibling === itemId);

            if (currentIndex < siblings.length - 1) {
                const targetSibling = siblings[currentIndex + 1];
                this.tree.setNodeAfter(itemId, targetSibling);
                logger.info(`Item moved down: ${itemId}`);
            }
        } catch (error) {
            logger.error("Failed to move item down:", error);
            throw error;
        }
    }

    /**
     * 子アイテムを取得
     */
    getChildren(itemId: string): OutlineItem[] {
        try {
            const childKeys = this.tree.getNodeChildrenFromKey(itemId);

            // 順序を正しく取得するためにsortChildrenByOrderを使用
            const sortedChildKeys = this.tree.sortChildrenByOrder(childKeys, itemId);

            return sortedChildKeys.map(childKey => {
                const value = this.tree.getNodeValueFromKey(childKey);
                return value as OutlineItem;
            }).filter(item => item !== null);
        } catch (error) {
            logger.error("Failed to get children:", error);
            return [];
        }
    }

    /**
     * 特定のIDのアイテムを取得
     */
    getItem(itemId: string): OutlineItem | null {
        try {
            const itemData = this.tree.getNodeValueFromKey(itemId);
            return itemData ? (itemData as OutlineItem) : null;
        } catch (error) {
            logger.error(`Failed to get item ${itemId}:`, error);
            return null;
        }
    }

    /**
     * YTreeインスタンスを取得（外部連携用）
     */
    getTree(): YTree {
        return this.tree;
    }

    /**
     * Y.Mapインスタンスを取得（外部連携用）
     */
    getYMap(): YMap<any> {
        return this.yMap;
    }

    /**
     * 変更通知の購読を登録
     * 戻り値の関数で購読解除できます
     */
    onUpdate(listener: () => void): () => void {
        this.updateListeners.add(listener);
        return () => this.updateListeners.delete(listener);
    }

    /**
     * ツリーが初期化されているかチェック
     */
    static checkForYTree(yMap: YMap<any>): boolean {
        return checkForYTree(yMap);
    }

    /**
     * リソースをクリーンアップ
     */
    destroy(): void {
        // Y.Map 監視を解除
        if (this._yObserver) {
            // @ts-ignore - yjs typings for unobserve accept (event, tx)
            this.yMap.unobserve(this._yObserver as any);
            this._yObserver = undefined;
        }
        // YTreeのクリーンアップ（必要に応じて）
        logger.info("YjsOrderedTreeManager destroyed");
    }
}
