import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * UIとSharedTree構造を同時に検証するユーティリティ関数群
 */
export class TreeValidator {
    /**
     * SharedTreeのデータ構造を取得する
     */
    static async getTreeData(page: Page): Promise<any> {
        // フォールバックなしで厳密に関数が存在することを確認
        return page.evaluate(() => {
            if (typeof window.getFluidTreeDebugData !== "function") {
                throw new Error("getFluidTreeDebugData function is not available");
            }
            return window.getFluidTreeDebugData();
        });
    }

    /**
     * インデント操作後にツリー構造とUIが一致しているか検証する
     */
    static async validateTreeStructure(page: Page): Promise<any> {
        // 1. SharedTreeの構造を取得
        const treeData = await this.getTreeData(page);

        // 2. UI表示を取得
        const uiStructure = await this.getUIStructure(page);

        // 3. 構造比較 (ログ出力)
        console.log("UI structure:", JSON.stringify(uiStructure, null, 2));
        console.log("SharedTree structure:", JSON.stringify(treeData, null, 2));

        // 4. 検証 - フォールバックなしで必ず検証を行う
        expect(this.structureMatches(treeData, uiStructure)).toBe(true);

        return treeData;
    }

    /**
     * UI構造を解析して階層構造を抽出
     */
    static async getUIStructure(page: Page): Promise<any> {
        return page.evaluate(() => {
            // UIからツリー構造を再構築する関数
            function parseOutlinerTree() {
                // ルートとなる要素を取得
                const container = document.querySelector(".tree-container");
                if (!container) return null;

                // 再帰的にUIの階層構造を抽出
                function parseNode(element: Element | null): any {
                    if (!element) return null;

                    // テキスト内容を取得
                    const textEl = element.querySelector(".item-text");
                    const text = textEl ? textEl.textContent || "" : "";

                    // 結果オブジェクト
                    const result: {
                        text: string;
                        hasChildren: boolean;
                        children: any[];
                    } = {
                        text,
                        hasChildren: false,
                        children: [],
                    };

                    // 子要素を検索
                    const childrenContainer = element.querySelector(".item-children");
                    if (childrenContainer) {
                        const childNodes = childrenContainer.querySelectorAll(":scope > .outliner-item");
                        result.hasChildren = childNodes.length > 0;

                        // 各子要素を再帰的に処理
                        childNodes.forEach((childNode: Element) => {
                            const childResult = parseNode(childNode);
                            if (childResult !== null) {
                                result.children.push(childResult);
                            }
                        });
                    }

                    return result;
                }

                // ルート要素の子アイテムを処理
                const result: { children: any[] } = { children: [] };
                const rootItems = container.querySelectorAll(":scope > .outliner-item");
                rootItems.forEach((item: Element) => {
                    const itemResult = parseNode(item);
                    if (itemResult !== null) {
                        result.children.push(itemResult);
                    }
                });

                return result;
            }

            return parseOutlinerTree();
        });
    }

    /**
     * 2つの階層構造が一致しているか確認
     */
    static structureMatches(treeData: any, uiStructure: any): boolean {
        // ここに構造比較ロジックを実装
        // 簡単な例: 子要素の数が一致し、テキストが同じか確認

        // データがない場合は不一致
        if (!treeData || !uiStructure) return false;

        // 子要素の数の検証
        const treeChildren = treeData.children || [];
        const uiChildren = uiStructure.children || [];

        if (treeChildren.length !== uiChildren.length) return false;

        // 各子要素を再帰的に検証
        for (let i = 0; i < treeChildren.length; i++) {
            // テキスト比較
            if (treeChildren[i]?.text !== uiChildren[i]?.text) return false;

            // 子要素の有無の比較
            if (Boolean(treeChildren[i]?.hasChildren) !== Boolean(uiChildren[i]?.hasChildren)) return false;

            // 子要素を再帰的に比較
            if (!this.structureMatches(treeChildren[i], uiChildren[i])) return false;
        }

        return true;
    }

    /**
     * SharedTreeの内容を取得し、期待値と厳密に比較する
     * @param page Playwrightのページオブジェクト
     * @param expectedData 期待されるデータ構造（部分的な構造も可）
     * @param strict 厳密に比較するかどうか（デフォルトはfalse）
     * @returns 検証結果
     */
    static async assertTreeData(page: Page, expectedData: any, strict: boolean = false): Promise<void> {
        const treeData = await this.getTreeData(page);

        if (strict) {
            // 厳密比較モード - 完全に一致する必要がある
            expect(JSON.stringify(treeData)).toBe(JSON.stringify(expectedData));
        } else {
            // 部分比較モード - 期待値のプロパティが全て含まれていればOK
            this.assertObjectContains(treeData, expectedData);
        }
    }

    /**
     * オブジェクトが期待値のプロパティを全て含んでいるか検証する
     * 再帰的に検証するため、ネストされたオブジェクトも検証可能
     */
    private static assertObjectContains(actual: any, expected: any): void {
        if (expected === null || expected === undefined) {
            expect(actual).toBe(expected);
            return;
        }

        if (typeof expected !== 'object') {
            expect(actual).toBe(expected);
            return;
        }

        if (Array.isArray(expected)) {
            expect(Array.isArray(actual)).toBe(true);
            expect(actual.length).toBeGreaterThanOrEqual(expected.length);

            for (let i = 0; i < expected.length; i++) {
                this.assertObjectContains(actual[i], expected[i]);
            }
            return;
        }

        // オブジェクトの場合は各プロパティを検証
        for (const key in expected) {
            expect(actual).toHaveProperty(key);
            this.assertObjectContains(actual[key], expected[key]);
        }
    }

    /**
     * SharedTreeの特定のパスにあるデータを取得して検証する
     * @param page Playwrightのページオブジェクト
     * @param path データのパス（例: "items.0.text"）
     * @param expectedValue 期待される値
     */
    static async assertTreePath(page: Page, path: string, expectedValue: any): Promise<void> {
        const treeData = await this.getTreeData(page);
        const actualValue = this.getValueByPath(treeData, path);
        expect(actualValue).toEqual(expectedValue);
    }

    /**
     * オブジェクトから指定されたパスの値を取得する
     * @param obj 対象オブジェクト
     * @param path パス（例: "items.0.text"）
     * @returns パスに対応する値
     */
    private static getValueByPath(obj: any, path: string): any {
        return path.split('.').reduce((prev, curr) => {
            return prev && prev[curr];
        }, obj);
    }

    /**
     * SharedTreeの内容をスナップショットとして保存し、後で比較できるようにする
     * @param page Playwrightのページオブジェクト
     * @returns 現在のツリーデータのスナップショット
     */
    static async takeTreeSnapshot(page: Page): Promise<any> {
        return await this.getTreeData(page);
    }

    /**
     * 現在のSharedTreeの内容と以前のスナップショットを比較する
     * @param page Playwrightのページオブジェクト
     * @param snapshot 以前のスナップショット
     * @param ignorePaths 無視するパスの配列（例: ["items.0.lastChanged"]）
     */
    static async compareWithSnapshot(page: Page, snapshot: any, ignorePaths: string[] = []): Promise<void> {
        const currentData = await this.getTreeData(page);
        const filteredSnapshot = this.removeIgnoredPaths(JSON.parse(JSON.stringify(snapshot)), ignorePaths);
        const filteredCurrent = this.removeIgnoredPaths(JSON.parse(JSON.stringify(currentData)), ignorePaths);

        expect(JSON.stringify(filteredCurrent)).toBe(JSON.stringify(filteredSnapshot));
    }

    /**
     * オブジェクトから指定されたパスのプロパティを削除する
     */
    private static removeIgnoredPaths(obj: any, paths: string[]): any {
        for (const path of paths) {
            const parts = path.split('.');
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
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        mockFluidClient?: boolean;
        mockUser?: { id: string; name: string; email?: string; };
        mockFluidToken?: { token: string; user: { id: string; name: string; }; };
        getFluidTreeDebugData?: () => any;
        fluidServerPort?: number;
    }
}
