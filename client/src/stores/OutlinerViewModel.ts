import { getLogger } from "../lib/logger";
import { Item, Items } from "../schema/app-schema";

const logger = getLogger();
// E2E/テスト環境では冗長ログを抑止
const __IS_E2E__ = (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
    || import.meta.env.MODE === "test"
    || import.meta.env.VITE_IS_TEST === "true";
const debugLog = (...args: any[]) => {
    if (!__IS_E2E__) console.log(...args);
};

const isItemLike = (obj: any): boolean => {
    try {
        const id = obj?.id;
        const txt = obj?.text;
        return typeof id === "string" && id.length > 0
            && (typeof txt === "string" || typeof txt?.toString === "function");
    } catch {
        return false;
    }
};

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

            debugLog("OutlinerViewModel: updateFromModel called");
            debugLog(
                "OutlinerViewModel: pageItem.items length:",
                (pageItem.items as any)?.length || 0,
            );

            // 既存のビューモデルをクリアせず、更新または追加する
            this.ensureViewModelsItemExist(pageItem);

            debugLog(
                "OutlinerViewModel: viewModels count after ensure:",
                this.viewModels.size,
            );

            // 表示順序と深度を再計算 - pageItem自体から開始
            this.recalculateOrderAndDepthItem(pageItem);

            debugLog(
                "OutlinerViewModel: visibleOrder length after recalculate:",
                this.visibleOrder.length,
            );
            logger.info({ count: this.visibleOrder.length }, "View models updated");
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

        for (const child of items) {
            this.ensureViewModelsItemExist(child, parentId);
        }
    }

    private ensureViewModelsItemExist(
        item: Item,
        parentId: string | null = null,
    ): void {
        if (!isItemLike(item)) return;

        debugLog(
            `OutlinerViewModel: ensureViewModelsItemExist for item "${item.text}" (id: ${item.id})`,
        );

        // 既存のビューモデルを更新または新規作成
        const existingViewModel = this.viewModels.get(item.id);
        if (existingViewModel) {
            // プロパティを更新（参照は維持）
            existingViewModel.text = item.text.toString();
            existingViewModel.votes = [...((item as any).votes || [])];
            existingViewModel.lastChanged = (item as any).lastChanged;
            existingViewModel.commentCount = (item as any).comments?.length ?? 0;
            debugLog(
                `OutlinerViewModel: Updated existing view model for "${item.text}"`,
            );
        } else {
            // 新しいビューモデルを作成
            this.viewModels.set(item.id, {
                id: item.id,
                original: item,
                text: item.text.toString(),
                votes: [...((item as any).votes || [])],
                author: (item as any).author,
                created: (item as any).created,
                lastChanged: (item as any).lastChanged,
                commentCount: (item as any).comments?.length ?? 0,
            });
            debugLog(
                `OutlinerViewModel: Created new view model for "${item.text}"`,
            );
        }

        // 親の設定
        this.parentMap.set(item.id, parentId);

        // 子アイテムも処理
        if (((it: any) => (it && typeof it.length === "number" && typeof it.at === "function"))((item as any).items)) {
            const children = item.items;
            debugLog(
                `OutlinerViewModel: Processing ${children.length} children for "${item.text.toString()}"`,
            );
            this.ensureViewModelsItemsExist(children, item.id);
        } else {
            debugLog(`OutlinerViewModel: No children for "${item.text.toString()}"`);
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

        for (const child of items) {
            this.recalculateOrderAndDepthItem(child, depth, parentId);
        }
    }
    /**
     * 表示順序と深度を再計算する（単一アイテム用）
     */
    private recalculateOrderAndDepthItem(
        item: Item,
        depth: number = 0,
        parentId: string | null = null, // eslint-disable-line @typescript-eslint/no-unused-vars
    ): void {
        if (!isItemLike(item)) return;

        // 表示順序を最初に初期化（ルートアイテムの場合のみ）
        if (depth === 0) {
            this.visibleOrder = [];
        }

        debugLog(
            `OutlinerViewModel: recalculateOrderAndDepthItem for "${item.text.toString()}" (depth: ${depth})`,
        );

        // 表示順序に追加
        this.visibleOrder.push(item.id);

        // 深度を設定
        this.depthMap.set(item.id, depth);
        const vm = this.viewModels.get(item.id);
        if (vm) {
            vm.commentCount = (item as any).comments?.length ?? 0;
        }

        // 子アイテムを処理（折りたたまれていない場合のみ）
        const isCollapsed = this.collapsedMap.get(item.id);
        const ch: any = (item as any).items;
        const hasChildren = !!(ch && typeof ch.length === "number" && typeof ch.at === "function" && ch.length > 0);

        debugLog(
            `OutlinerViewModel: Item "${item.text.toString()}" - hasChildren: ${hasChildren}, isCollapsed: ${isCollapsed}, childrenCount: ${
                hasChildren ? item.items.length : 0
            }`,
        );

        if (hasChildren && !isCollapsed) {
            const children = item.items;
            debugLog(
                `OutlinerViewModel: Processing ${children.length} children for "${item.text.toString()}"`,
            );
            for (const child of children) {
                this.recalculateOrderAndDepthItem(child, depth + 1, item.id);
            }
        } else if (hasChildren && isCollapsed) {
            debugLog(
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
        if (!rootItem) return;
        if (
            ((it: any) => (it && typeof it.length === "number" && typeof it.at === "function"))(
                (rootItem as any)?.items,
            )
        ) {
            this.recalculateOrderAndDepth(rootItem.items);
        }
    }

    /**
     * ルートアイテムを見つける
     */
    private findRootItem(itemId: string): Item | null {
        const item = this.viewModels.get(itemId)?.original;
        if (!item) return null;

        let current: Item = item;
        let parentList = current.parent;

        while (parentList && parentList.parentKey !== "root") {
            current = new Item(current.ydoc, current.tree, parentList.parentKey);
            parentList = current.parent;
        }

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
                    logger.error({ id }, "View model not found for ID");
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
        const ch: any = (model.original as any).items;
        return !!(ch && typeof ch.length === "number" && typeof ch.at === "function" && ch.length > 0);
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
