import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * カーソル情報とカーソル選択範囲を検証するユーティリティ関数群
 */
export class CursorValidator {
    /**
     * カーソル情報を取得する
     */
    static async getCursorData(page: Page): Promise<any> {
        // まず、デバッグ関数をセットアップ
        await page.evaluate(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getCursorDebugData = function () {
                // EditorOverlayStoreインスタンスを取得
                const editorOverlayStore = window.editorOverlayStore;
                if (!editorOverlayStore) {
                    console.error("EditorOverlayStore instance not found");
                    return { error: "EditorOverlayStore instance not found" };
                }

                try {
                    // カーソル情報を取得
                    const cursors = Object.values(editorOverlayStore.cursors);
                    const selections = Object.values(editorOverlayStore.selections);
                    const activeItemId = editorOverlayStore.activeItemId;
                    const cursorVisible = editorOverlayStore.cursorVisible;

                    // カーソルインスタンスの情報を取得
                    const cursorInstances: Array<any> = [];

                    editorOverlayStore.cursorInstances.forEach((cursor: any, id: string) => {
                        cursorInstances.push({
                            cursorId: id,
                            itemId: cursor.itemId,
                            offset: cursor.offset,
                            isActive: cursor.isActive,
                            userId: cursor.userId,
                        });
                    });

                    return {
                        cursors,
                        selections,
                        activeItemId,
                        cursorVisible,
                        cursorInstances,
                        cursorCount: cursors.length,
                        selectionCount: selections.length,
                    };
                }
                catch (error) {
                    console.error("Error getting cursor data:", error);
                    return { error: error.message || "Unknown error" };
                }
            };
        });

        // カーソル情報を取得
        return page.evaluate(() => {
            return window.getCursorDebugData!();
        });
    }

    /**
     * カーソル情報を取得し、期待値と比較する
     * @param page Playwrightのページオブジェクト
     * @param expectedData 期待されるデータ構造（部分的な構造も可）
     * @param strict 厳密に比較するかどうか（デフォルトはfalse）
     * @returns 検証結果
     */
    static async assertCursorData(page: Page, expectedData: any, strict: boolean = false): Promise<void> {
        const cursorData = await this.getCursorData(page);

        if (strict) {
            // 厳密比較モード - 完全に一致する必要がある
            expect(JSON.stringify(cursorData)).toBe(JSON.stringify(expectedData));
        }
        else {
            // 部分比較モード - 期待値のプロパティが全て含まれていればOK
            this.assertObjectContains(cursorData, expectedData);
        }
    }

    /**
     * オブジェクトが期待値のプロパティを全て含んでいるか検証する
     * @param actual 実際の値
     * @param expected 期待値
     */
    private static assertObjectContains(actual: any, expected: any): void {
        if (typeof expected !== "object" || expected === null) {
            expect(actual).toEqual(expected);
            return;
        }

        if (Array.isArray(expected)) {
            expect(Array.isArray(actual)).toBe(true);
            expect(actual.length).toBeGreaterThanOrEqual(expected.length);

            for (let i = 0; i < expected.length; i++) {
                if (i < actual.length) {
                    this.assertObjectContains(actual[i], expected[i]);
                }
                else {
                    throw new Error(`Expected array item at index ${i} not found in actual array`);
                }
            }
        }
        else {
            for (const key in expected) {
                expect(actual).toHaveProperty(key);
                this.assertObjectContains(actual[key], expected[key]);
            }
        }
    }

    /**
     * カーソルの特定のパスにあるデータを取得して検証する
     * @param page Playwrightのページオブジェクト
     * @param path データのパス（例: "cursors.0.offset"）
     * @param expectedValue 期待される値
     */
    static async assertCursorPath(page: Page, path: string, expectedValue: any): Promise<void> {
        const cursorData = await this.getCursorData(page);
        const actualValue = this.getValueByPath(cursorData, path);
        expect(actualValue).toEqual(expectedValue);
    }

    /**
     * オブジェクトから指定されたパスの値を取得する
     * @param obj 対象オブジェクト
     * @param path パス（例: "cursors.0.offset"）
     * @returns パスに対応する値
     */
    private static getValueByPath(obj: any, path: string): any {
        return path.split(".").reduce((prev, curr) => {
            return prev && prev[curr];
        }, obj);
    }

    /**
     * 現在のカーソル情報のスナップショットを取得する
     * @param page Playwrightのページオブジェクト
     * @returns カーソル情報のスナップショット
     */
    static async takeCursorSnapshot(page: Page): Promise<any> {
        const cursorData = await this.getCursorData(page);
        return JSON.parse(JSON.stringify(cursorData));
    }

    /**
     * 現在のカーソル情報と以前のスナップショットを比較する
     * @param page Playwrightのページオブジェクト
     * @param snapshot 以前のスナップショット
     * @param ignorePaths 無視するパスの配列（例: ["cursors.0.lastChanged"]）
     */
    static async compareWithSnapshot(page: Page, snapshot: any, ignorePaths: string[] = []): Promise<void> {
        const currentData = await this.getCursorData(page);
        const filteredSnapshot = this.removeIgnoredPaths(JSON.parse(JSON.stringify(snapshot)), ignorePaths);
        const filteredCurrent = this.removeIgnoredPaths(JSON.parse(JSON.stringify(currentData)), ignorePaths);

        expect(JSON.stringify(filteredCurrent)).toBe(JSON.stringify(filteredSnapshot));
    }

    /**
     * オブジェクトから指定されたパスのプロパティを削除する
     */
    private static removeIgnoredPaths(obj: any, paths: string[]): any {
        for (const path of paths) {
            const parts = path.split(".");
            const lastPart = parts.pop()!;
            const parent = parts.reduce((prev, curr) => {
                return prev && prev[curr];
            }, obj);

            if (parent && parent[lastPart] !== undefined) {
                delete parent[lastPart];
            }
        }
        return obj;
    }

    /**
     * カーソルの数を検証する
     * @param page Playwrightのページオブジェクト
     * @param expectedCount 期待されるカーソルの数
     */
    static async assertCursorCount(page: Page, expectedCount: number): Promise<void> {
        const cursorData = await this.getCursorData(page);
        expect(cursorData.cursors.length).toBe(expectedCount);
    }

    /**
     * アクティブなカーソルのアイテムIDを検証する
     * @param page Playwrightのページオブジェクト
     * @param expectedItemId 期待されるアイテムID
     */
    static async assertActiveItemId(page: Page, expectedItemId: string): Promise<void> {
        const cursorData = await this.getCursorData(page);
        expect(cursorData.activeItemId).toBe(expectedItemId);
    }
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
    }
}
