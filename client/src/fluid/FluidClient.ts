export class FluidClient {
  private container: any;
  private _sharedTree: any;

  constructor(container: any, sharedTree: any) {
    this.container = container;
    this._sharedTree = sharedTree;
  }

  /**
   * E2Eテスト用に現在のSharedTreeデータ構造を取得する
   * @returns ツリー構造のシリアライズされたデータ
   */
  public getTreeDebugData(): any {
    if (!this.container || !this._sharedTree) {
      return null;
    }

    // SharedTreeのデータ構造をシリアライズして返す
    const treeData = this._sharedTree.root;

    // 再帰的にツリー構造をプレーンなオブジェクトに変換
    return this._serializeTreeNode(treeData);
  }

  /**
   * ツリーノードを再帰的にシリアライズする
   * @private
   */
  private _serializeTreeNode(node: any): any {
    if (!node) return null;

    // ID、テキスト、子アイテムなどの基本情報を収集
    const result: any = {
      id: node.id,
      text: node.text,
      hasChildren: node.items?.length > 0
    };

    // 子アイテムを再帰的に処理
    if (node.items && node.items.length > 0) {
      result.children = [];
      for (const child of node.items) {
        result.children.push(this._serializeTreeNode(child));
      }
    }

    return result;
  }
}

// グローバルアクセス用のヘルパー関数（テスト用）
if (typeof window !== 'undefined') {
  (window as any).getFluidTreeDebugData = () => {
    if ((window as any).__FLUID_CLIENT__) {
      return (window as any).__FLUID_CLIENT__.getTreeDebugData();
    }
    return null;
  };
}