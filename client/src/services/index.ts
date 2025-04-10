// サービス機能のエクスポートをまとめたバレルファイル
// 循環依存を避けるためのパターン

// FirestoreStore関連の関数をエクスポート
export {
    getDefaultContainerId,
    saveContainerId as saveFirestoreContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
    type UserContainer,
    userContainer,
} from "../stores/firestoreStore";

// FluidService関連の関数をエクスポート
export {
    createFluidClient,
    createNewContainer,
    getConnectionStateString,
    getFluidClient,
    handleConnectionError,
    isContainerConnected,
    loadContainer,
    loadContainerId,
    resetContainerId,
    resetFluidClient,
    saveContainerId,
    saveContainerIdToServer,
    serializeTreeNode,
    setupConnectionListeners,
} from "../lib/fluidService";
