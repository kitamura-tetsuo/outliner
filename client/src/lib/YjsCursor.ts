// Yjsモード専用のカーソル実装
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { ScrapboxFormatter } from "../utils/ScrapboxFormatter";
import { getLogger } from "./logger";
import { YjsProjectManager } from "./yjsProjectManager.svelte";

const logger = getLogger();

// Yjsにテキスト更新を適用するヘルパー関数
async function applyTextUpdateToYjs(itemId: string, newText: string): Promise<void> {
    try {
        const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
        if (!yjsProjectManager) {
            console.log(`🔧 [Yjs] YjsProjectManager not available for text update`);
            return;
        }

        console.log(`🔧 [Yjs] Updating text for item ${itemId} in Yjs mode: "${newText}"`);

        // YjsProjectManagerでテキスト更新を実行
        const pages = yjsProjectManager.getPages();
        if (pages.length > 0) {
            // 現在のページIDを優先
            const currentPageId: string | undefined = (window as any).__CURRENT_PAGE_ID__;
            const page = (currentPageId && pages.find((p: any) => p.id === currentPageId)) || pages[0];
            const pageManager = await yjsProjectManager.connectToPage(page.id);

            // アイテムのテキストを更新（アイテムが存在しない場合は作成）
            try {
                pageManager.updateItemText(itemId, newText);
                console.log(`🔧 [Yjs] Successfully updated text for item ${itemId}`);
            } catch (updateError) {
                // アイテムが存在しない場合は新規作成
                console.log(`🔧 [Yjs] Item ${itemId} not found on page ${page.id}, creating new item`);
                const createdItemId = await yjsProjectManager.addItemToPage(
                    page.id,
                    newText,
                    "local",
                    undefined,
                    itemId,
                );
                if (createdItemId) {
                    console.log(`🔧 [Yjs] Successfully created new item ${createdItemId} with text "${newText}"`);
                } else {
                    console.error(`🔧 [Yjs] Failed to create new item ${itemId}`);
                }
            }
        }
    } catch (error) {
        console.error(`🔧 [Yjs] Error updating text in Yjs mode:`, error);
    }
}

interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

/**
 * Yjsモード専用のカーソルクラス
 * Fluidライブラリに依存しない実装
 */
export class YjsCursor {
    public itemId: string;
    public offset: number;
    public isActive: boolean;
    public userId: string;

    constructor(options: CursorOptions) {
        this.itemId = options.itemId;
        this.offset = options.offset;
        this.isActive = options.isActive;
        this.userId = options.userId;
    }

    /**
     * カーソル位置にテキストを挿入
     */
    async insertText(text: string): Promise<void> {
        try {
            // 現在のテキストを取得
            const currentText = await this.getCurrentText();

            // テキストを挿入
            const beforeText = currentText.slice(0, this.offset);
            const afterText = currentText.slice(this.offset);
            const newText = beforeText + text + afterText;

            // Yjsに更新を適用
            await applyTextUpdateToYjs(this.itemId, newText);

            // カーソル位置を更新
            this.offset += text.length;

            console.log(`🔧 [YjsCursor] Inserted text "${text}" at offset ${this.offset - text.length}`);
        } catch (error) {
            console.error(`🔧 [YjsCursor] Error inserting text:`, error);
        }
    }

    /**
     * 現在のアイテムのテキストを取得
     */
    private async getCurrentText(): Promise<string> {
        try {
            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                return "";
            }

            const pages = yjsProjectManager.getPages();
            if (pages.length > 0) {
                const currentPageId: string | undefined = (window as any).__CURRENT_PAGE_ID__;
                const page = (currentPageId && pages.find((p: any) => p.id === currentPageId)) || pages[0];
                const pageManager = await yjsProjectManager.connectToPage(page.id);
                const item = pageManager.getItem(this.itemId);
                return item?.text || "";
            }
            return "";
        } catch (error) {
            console.error(`🔧 [YjsCursor] Error getting current text:`, error);
            return "";
        }
    }

    /**
     * テキストを更新
     */
    async updateText(newText: string): Promise<void> {
        try {
            await applyTextUpdateToYjs(this.itemId, newText);
            console.log(`🔧 [YjsCursor] Updated text for item ${this.itemId}: "${newText}"`);
        } catch (error) {
            console.error(`🔧 [YjsCursor] Error updating text:`, error);
        }
    }

    /**
     * カーソル位置でテキストを分割（Enter処理）
     */
    async splitText(): Promise<string | null> {
        try {
            const currentText = await this.getCurrentText();
            const beforeText = currentText.slice(0, this.offset);
            const afterText = currentText.slice(this.offset);

            // 現在のアイテムのテキストを更新
            await applyTextUpdateToYjs(this.itemId, beforeText);

            // 新しいアイテムを作成
            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (yjsProjectManager) {
                const pages = yjsProjectManager.getPages();
                if (pages.length > 0) {
                    const currentPageId: string | undefined = (window as any).__CURRENT_PAGE_ID__;
                    const page = (currentPageId && pages.find((p: any) => p.id === currentPageId)) || pages[0];
                    const newItemId = await yjsProjectManager.addItemToPage(page.id, afterText, "local");
                    console.log(`🔧 [YjsCursor] Split text: created new item ${newItemId} with text "${afterText}"`);
                    return newItemId;
                }
            }

            return null;
        } catch (error) {
            console.error(`🔧 [YjsCursor] Error splitting text:`, error);
            return null;
        }
    }

    /**
     * カーソルをストアに適用
     */
    applyToStore(): void {
        store.setCursor({
            itemId: this.itemId,
            offset: this.offset,
            isActive: this.isActive,
            userId: this.userId,
        });
    }

    /**
     * カーソルの位置を設定
     */
    setPosition(offset: number): void {
        this.offset = Math.max(0, offset);
    }

    /**
     * カーソルをアクティブ/非アクティブに設定
     */
    setActive(isActive: boolean): void {
        this.isActive = isActive;
    }
}

/**
 * Yjsモード用のカーソルファクトリー関数
 */
export function createYjsCursor(options: CursorOptions): YjsCursor {
    return new YjsCursor(options);
}
