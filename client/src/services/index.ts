// サービス機能のエクスポートをまとめたバレルファイル
// 循環依存を避けるためのパターン

// FirestoreStore関連の関数をエクスポート
export {
    getDefaultContainerId,
    saveContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
    userContainer,
} from "../stores/firestoreStore";

// FluidService関連の関数をエクスポート
export {
    cleanupFluidClient,
    createFluidClient,
    createNewContainer,
    initFluidClientWithAuth,
    loadContainer,
} from "../lib/fluidService";
