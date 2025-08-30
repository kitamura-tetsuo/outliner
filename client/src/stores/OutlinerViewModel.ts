// @ts-nocheck
import { getLogger } from "../lib/logger";
import { Item, Items } from "../schema/app-schema";

const logger = getLogger();

// ビューモデルのインターフェース
export interface OutlinerItemViewModel {
    id: string;
    original: Item; // 元のFluidオブジェクトへの参照
    text: string;
    votes: string[];
    author: string;
    created: number;
    lastChanged: number;
    commentCount: number;
}

// 表示用のアイテム情報
export interface DisplayItem {
    model: OutlinerItemViewModel;
    depth: number;
    parentId: string | null;
}

/**
 * アウトライナーのビューモデルを管理するストア
 * DOMの再生成を避けるために、アイテムの参照同一性を維持する
 */
export class OutlinerViewModel {
    // IDによるビューモデルマップ（参照同一性を維持）
    private viewModels = new Map<string, OutlinerItemViewModel>();

    // 表示順序を示すID配列
    private visibleOrder: string[] = [];

    // アイテムの深度マップ
    private depthMap = new Map<string, number>();

    // 親アイテムIDのマップ
    private parentMap = new Map<string, string | null>();

    // 折りたたみ状態のマップ
    private collapsedMap = new Map<string, boolean>();

    // 更新中フラグ
    private _isUpdating = false;

    /**
     * データモデルからビューモデルを更新する
     * @param pageItem ルートアイテムのコレクション
     */
    updateFromModel(pageItem: Item): void {
        // 更新中に既に処理中かどうかをチェック
        if (this._isUpdating) return;

        try {
            this._isUpdating = true;

            console.log("OutlinerViewModel: updateFromModel called");
            console.log(
                "OutlinerViewModel: pageItem.items length:",
                (pageItem.items as any)?.length || 0,
            );

            // 既存のビューモデルをクリアせず、更新または追加する
            this.ensureViewModelsItemExist(pageItem);

            console.log(
                "OutlinerViewModel: viewModels count after ensure:",
                this.viewModels.size,
            );

            // 表示順序と深度を再計算 - pageItem自体から開始
            this.recalculateOrderAndDepthItem(pageItem);

            console.log(
                "OutlinerViewModel: visibleOrder length after recalculate:",
                this.visibleOrder.length,
            );
            logger.info("View models updated, count:", this.visibleOrder.length);
        } finally {
            this._isUpdating = false;
        }
    }

    /**
     * アイテムのビューモデルが存在することを確認し、必要に応じて作成または更新する
     */
    private ensureViewModelsItemsExist(
        items: Items,
        parentId: string | null = null,
    ): void {
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const child = (items as any).at ? (items as any).at(i) : (items as any)[i];
            if (child) this.ensureViewModelsItemExist(child, parentId);
        }
    }

    private ensureViewModelsItemExist(
        item: Item,
        parentId: string | null = null,
    ): void {
        if (!(item instanceof Item) || !item.id) return;

        const textStr = item.text?.toString?.() ?? String(item.text ?? "");

        console.log(
            `OutlinerViewModel: ensureViewModelsItemExist for item "${textStr}" (id: ${item.id})`,
        );

        // 既存のビューモデルを更新または新規作成
        const existingViewModel = this.viewModels.get(item.id);
        if (existingViewModel) {
            // プロパティを更新（参照は維持）
            existingViewModel.text = textStr;
            existingViewModel.votes = item.votes?.toArray ? item.votes.toArray() : [...(item as any).votes];
            existingViewModel.lastChanged = item.lastChanged;
            existingViewModel.commentCount = item.comments?.length ?? 0;
            console.log(
                `OutlinerViewModel: Updated existing view model for "${textStr}"`,
            );
        } else {
            // 新しいビューモデルを作成
            this.viewModels.set(item.id, {
                id: item.id,
                original: item,
                text: textStr,
                votes: item.votes?.toArray ? item.votes.toArray() : [...(item as any).votes],
                author: item.author,
                created: item.created,
                lastChanged: item.lastChanged,
                commentCount: item.comments?.length ?? 0,
            });
            console.log(
                `OutlinerViewModel: Created new view model for "${textStr}"`,
            );
        }

        // 親の設定
        this.parentMap.set(item.id, parentId);

        // 子アイテムも処理
        if (item.items && (item.items instanceof Items)) {
            const children = item.items as Items;
            console.log(
                `OutlinerViewModel: Processing ${children.length} children for "${textStr}"`,
            );
            this.ensureViewModelsItemsExist(children, item.id);
        } else {
            console.log(`OutlinerViewModel: No children for "${textStr}"`);
        }
    }
    /**
     * 表示順序と深度を再計算する
     */
    private recalculateOrderAndDepth(
        items: Items,
        depth: number = 0,
        parentId: string | null = null,
    ): void {
        if (!items) return;

        // 表示順序と深度を最初に初期化
        if (depth === 0) {
            this.visibleOrder = [];
        }

        for (let i = 0; i < items.length; i++) {
            const child = (items as any).at ? (items as any).at(i) : (items as any)[i];
            if (child) this.recalculateOrderAndDepthItem(child, depth, parentId);
        }
    }
    /**
     * 表示順序と深度を再計算する（単一アイテム用）
     */
    private recalculateOrderAndDepthItem(
        item: Item,
        depth: number = 0,
        parentId: string | null = null,
    ): void {
        if (!(item instanceof Item) || !item.id) return;

        // 表示順序を最初に初期化（ルートアイテムの場合のみ）
        if (depth === 0) {
            this.visibleOrder = [];
        }

        console.log(
            `OutlinerViewModel: recalculateOrderAndDepthItem for "${item.text}" (depth: ${depth})`,
        );

        // 表示順序に追加
        this.visibleOrder.push(item.id);

        // 深度を設定
        this.depthMap.set(item.id, depth);
        const vm = this.viewModels.get(item.id);
        if (vm) {
            vm.commentCount = item.comments?.length ?? 0;
        }

        // 子アイテムを処理（折りたたまれていない場合のみ）
        const isCollapsed = this.collapsedMap.get(item.id);
        const hasChildren = item.items && (item.items instanceof Items) && (item.items as any).length > 0;

        console.log(
            `OutlinerViewModel: Item "${
                (item.text as any)?.toString?.() ?? item.text
            }" - hasChildren: ${hasChildren}, isCollapsed: ${isCollapsed}, childrenCount: ${
                hasChildren ? (item.items as any).length : 0
            }`,
        );

        if (hasChildren && !isCollapsed) {
            const children = item.items as any;
            console.log(
                `OutlinerViewModel: Processing ${children.length} children for "${item.text}"`,
            );
            for (let i = 0; i < children.length; i++) {
                this.recalculateOrderAndDepthItem(children[i], depth + 1, item.id);
            }
        } else if (hasChildren && isCollapsed) {
            console.log(
                `OutlinerViewModel: Skipping children for "${item.text}" because it's collapsed`,
            );
        } else if (!hasChildren) {
            console.log(`OutlinerViewModel: No children for "${item.text}"`);
        }
    }

    /**
     * アイテムの折りたたみ状態を切り替える
     */
    toggleCollapsed(itemId: string): void {
        const isCollapsed = this.collapsedMap.get(itemId) || false;
        this.collapsedMap.set(itemId, !isCollapsed);

        // モデルから表示情報を再計算（アイテムインスタンスは維持）
        const rootItem = this.findRootItem(itemId);
        if (rootItem && rootItem.items && (rootItem.items instanceof Items)) {
            this.recalculateOrderAndDepth(rootItem.items);
        }
    }

    /**
     * ルートアイテムを見つける
     */
    private findRootItem(itemId: string): Item | null {
        const item = this.viewModels.get(itemId)?.original;
        if (!item) return null;

        let current = item;
        let parent: unknown;

        // ルートに到達するまで親を辿る
        // NOTE: FluidのTree.parent依存は削除。ルートは呼び出し側（ページ）なのでそのまま返す
        // YTree版では呼び出し側が常にルートItemを渡す前提
        return current;
    }

    /**
     * 表示用のアイテムリストを取得する
     */
    getVisibleItems(): DisplayItem[] {
        return this.visibleOrder
            .map(id => {
                const model = this.viewModels.get(id);
                if (!model) {
                    logger.error("View model not found for ID:", id);
                    return null;
                }

                return {
                    model,
                    depth: this.depthMap.get(id) || 0,
                    parentId: this.parentMap.get(id) || null,
                };
            })
            .filter((item): item is DisplayItem => item !== null);
    }

    /**
     * アイテムの折りたたみ状態を取得
     */
    isCollapsed(itemId: string): boolean {
        return this.collapsedMap.get(itemId) || false;
    }

    /**
     * アイテムが子を持っているかを確認
     */
    hasChildren(itemId: string): boolean {
        const model = this.viewModels.get(itemId);
        if (!model || !model.original || !model.original.items) return false;
        const children = model.original.items as any;
        return (children instanceof Items || typeof children.length === "number") && children.length > 0;
    }

    /**
     * ビューモデルを直接取得
     */
    getViewModel(id: string): OutlinerItemViewModel | undefined {
        return this.viewModels.get(id);
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        this.viewModels.clear();
        this.visibleOrder = [];
        this.depthMap.clear();
        this.parentMap.clear();
        this.collapsedMap.clear();
    }
}
