import {
    Tree,
    type TreeNode,
} from "fluid-framework";
import { onDestroy } from "svelte";
import { getLogger } from "./logger";

const logger = getLogger();

/**
 * 購読管理クラス - 複数の購読を管理し、自動的にクリーンアップする
 */
export class SubscriptionManager {
    private subscriptions: Map<string, Function> = new Map();

    /**
     * TreeNodeのイベントを購読する
     * @param node イベントを購読するTreeNode
     * @param eventName イベント名
     * @param callback コールバック関数
     * @param key 購読を識別するためのキー（省略時は自動生成）
     * @returns 購読を解除する関数
     */
    subscribe(node: TreeNode | null | undefined, eventName: string, callback: Function, key?: string): Function {
        if (!node) {
            logger.warn(`Cannot subscribe to ${eventName} on null/undefined node`);
            return () => {};
        }

        // キーが提供されていない場合、node+eventNameの組み合わせを使用
        const subscriptionKey = key || `${node.id || "unknown"}-${eventName}`;

        // 既存の購読があれば解除
        this.unsubscribe(subscriptionKey);

        // 新しい購読を追加
        const unsubscribe = Tree.on(node, eventName, callback);
        this.subscriptions.set(subscriptionKey, unsubscribe);

        logger.debug(`Subscribed to ${eventName} with key ${subscriptionKey}`);

        // 購読解除関数を返す
        return () => this.unsubscribe(subscriptionKey);
    }

    /**
     * 特定のキーの購読を解除する
     * @param key 購読キー
     */
    unsubscribe(key: string): void {
        if (this.subscriptions.has(key)) {
            const unsubscribe = this.subscriptions.get(key)!;
            unsubscribe();
            this.subscriptions.delete(key);
            logger.debug(`Unsubscribed from ${key}`);
        }
    }

    /**
     * すべての購読を解除する
     */
    unsubscribeAll(): void {
        this.subscriptions.forEach((unsubscribe, key) => {
            unsubscribe();
            logger.debug(`Unsubscribed from ${key}`);
        });
        this.subscriptions.clear();
    }
}

/**
 * Svelteコンポーネント用のサブスクリプションマネージャーを作成
 * コンポーネントがデストロイされたときに自動的に全ての購読を解除する
 */
export function createSubscriptionManager(): SubscriptionManager {
    const manager = new SubscriptionManager();

    // コンポーネントのデストロイ時に自動的に全ての購読を解除
    onDestroy(() => {
        manager.unsubscribeAll();
    });

    return manager;
}
