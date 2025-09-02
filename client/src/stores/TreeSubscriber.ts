// Yjsモード: Y.Textの変更を監視してSvelte5へ通知
import { createSubscriber } from "svelte/reactivity";
import * as Y from "yjs";
import type { TreeNode } from "../schema/app-schema";

export class TreeSubscriber<T extends TreeNode, R = T> {
    subscribe;
    private _currentValue: R;

    private _yObserver?: (e: Y.YTextEvent, tr: Y.Transaction) => void;

    constructor(
        private node: T,
        eventName: string, // 互換のため引数は保持（未使用）
        private getter: () => R = () => node as unknown as R,
        private setter?: (value: R) => void,
    ) {
        // 初期値を設定
        this._currentValue = this.getter();

        // Yjsの監視をセットアップ
        this.subscribe = createSubscriber(update => {
            // ItemなどY.Textを持つノードならobserve
            const yText: Y.Text | undefined = (this.node as any)?.yText as Y.Text | undefined;
            if (yText && typeof yText.observe === "function") {
                this._yObserver = () => {
                    // getterで再計算（Item.textはY.Textと同期されている）
                    this._currentValue = this.getter();
                    update();
                };
                yText.observe(this._yObserver);
                return () => {
                    if (this._yObserver) yText.unobserve(this._yObserver);
                };
            }
            // 監視対象がない場合はno-op
            return () => {};
        });
    }

    get current() {
        this.subscribe();
        return this._currentValue;
    }

    set current(value: R) {
        this._currentValue = value;
        this.setter?.(value);
    }

    /**
     * 手動で値を更新（フォールバック用）
     */
    updateValue(): void {
        this._currentValue = this.getter();
    }
}
