// サービス機能のエクスポートをまとめたバレルファイル
// 循環依存を避けるためのパターン

// FirestoreStore関連の関数をエクスポート
export {
    firestoreStore,
    getDefaultContainerId,
    saveContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
} from "../stores/firestoreStore.svelte";

// FluidService関連の関数をエクスポート
export {
    cleanupFluidClient,
    createFluidClient,
    createNewContainer,
    deleteContainer,
    getFluidClientByProjectTitle,
    getProjectTitle,
    getUserContainers,
    initFluidClientWithAuth,
    loadContainer,
} from "../lib/fluidService.svelte";

// SnapshotService
export {
    addSnapshot,
    getCurrentContent,
    getSnapshot,
    listSnapshots,
    replaceWithSnapshot,
    setCurrentContent,
    type Snapshot,
} from "./snapshotService";

// ScheduleService
export { cancelSchedule, createSchedule, listSchedules, type Schedule } from "./scheduleService";

// Import/Export Service
export {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "./importExportService";

// Attachment Service
export { deleteAttachment, listAttachments, uploadAttachment } from "./attachmentService";
