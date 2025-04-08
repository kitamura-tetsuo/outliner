// TypeScriptの型情報を確認するためのファイル
// このファイルは実行するためではなく、型チェックのためだけに使用します

// fluid-frameworkからの型情報を確認
import {
    ConnectionState,
    type ContainerSchema,
    IFluidContainer,
    SharedTree,
    Tree,
    TreeView,
    TreeViewConfiguration,
    // ViewableTree は存在しないことが確認された
} from "fluid-framework";

// 新規：エクスポートの有無とプロパティのチェック
// このコードをトランスパイル時に型チェックすることで、
// 何がエクスポートされ、何が存在しないかを確認できます
type FluidExportsCheck = {
    ConnectionState: typeof ConnectionState;
    ContainerSchema: ContainerSchema;
    IFluidContainer: IFluidContainer;
    SharedTree: typeof SharedTree;
    Tree: typeof Tree;
    TreeView: TreeView<any>;
    TreeViewConfiguration: typeof TreeViewConfiguration;
    // ViewableTree は存在しないことが確認された
    // ViewableTree: ViewableTree;
};

// 型が存在するかをチェック
const testSchema: ContainerSchema = {
    initialObjects: {
        testObject: SharedTree,
    },
};

// SharedTreeのライフサイクルメソッドとプロパティを検証
// エラー修正: SharedTreeは直接インスタンス化できない
function checkSharedTreeMethods() {
    // 実際の使用パターン: ここではコンテナからSharedTreeを取得するイメージ
    const sharedTreeObj = {} as any as SharedTree;

    // viewWithメソッドが存在することを確認
    const viewConfig = new TreeViewConfiguration({} as any);
    const treeView = sharedTreeObj.viewWith(viewConfig);

    // SharedTree -> TreeViewへの変換パターンをチェック
    // エラー修正: SharedTree型を正しく指定
    function inspectSharedTree(tree: typeof SharedTree) {
        // SharedTreeからTreeViewを取得する標準パターン - 実際はこのままでは動作しない
        // ここでは型チェックのためだけのコード
        return tree;
    }

    return { treeView };
}

// SSRに対応した安全なアクセスパターン
function safeAccessPattern() {
    // SSR環境かどうかを検出
    const isSSR = typeof window === "undefined";
    console.log(`Running in ${isSSR ? "SSR" : "Browser"} environment`);

    // 安全なキャストパターン
    function getTreeView(container: IFluidContainer) {
        const appData = container.initialObjects.appData;
        // appDataがSharedTreeかどうか確認
        if (appData && typeof (appData as any).viewWith === "function") {
            // SharedTreeとして安全に扱う
            const configObj = new TreeViewConfiguration({} as any);
            return (appData as SharedTree).viewWith(configObj);
        }
        return null;
    }

    return { getTreeView };
}

// 実際のアプリコードで使用する安全なパターン
function safeInitializationPattern(container: IFluidContainer, config: TreeViewConfiguration) {
    try {
        // 安全な2ステップのキャストパターン
        const sharedTree = container.initialObjects.appData as SharedTree;
        const treeView = sharedTree.viewWith(config);
        return treeView;
    }
    catch (error) {
        console.error("Failed to initialize TreeView:", error);
        throw error;
    }
}
