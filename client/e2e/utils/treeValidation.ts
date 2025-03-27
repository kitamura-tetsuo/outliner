import { expect, Page } from '@playwright/test';

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
      debugger
      if (typeof window.getFluidTreeDebugData !== 'function') {
        throw new Error('getFluidTreeDebugData function is not available');
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
    console.log('UI structure:', JSON.stringify(uiStructure, null, 2));
    console.log('SharedTree structure:', JSON.stringify(treeData, null, 2));

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
        const container = document.querySelector('.tree-container');
        if (!container) return null;

        // 再帰的にUIの階層構造を抽出
        function parseNode(element) {
          if (!element) return null;

          // テキスト内容を取得
          const textEl = element.querySelector('.item-text');
          const text = textEl ? textEl.textContent : '';

          // 結果オブジェクト
          const result = {
            text,
            hasChildren: false,
            children: []
          };

          // 子要素を検索
          const childrenContainer = element.querySelector('.item-children');
          if (childrenContainer) {
            const childNodes = childrenContainer.querySelectorAll(':scope > .outliner-item');
            result.hasChildren = childNodes.length > 0;

            // 各子要素を再帰的に処理
            childNodes.forEach(childNode => {
              result.children.push(parseNode(childNode));
            });
          }

          return result;
        }

        // ルート要素の子アイテムを処理
        const result = { children: [] };
        const rootItems = container.querySelectorAll(':scope > .outliner-item');
        rootItems.forEach(item => {
          result.children.push(parseNode(item));
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
}
