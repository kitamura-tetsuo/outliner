// サービス機能のエクスポートをまとめたバレルファイル
// 循環依存を避けるためのパターン

// FirestoreStore関連の関数をエクスポート
export {
    firestoreStore,
    getDefaultContainerId,
    saveContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
} from "../stores/firestoreStore.svelte";

// Yjs Service functions (Fluid replacement)
export {
    cleanupClient as cleanupYjsClient,
    createClient as createYjsClient,
    createNewProject as createNewYjsProject,
    getClientByProjectTitle as getYjsClientByProjectTitle,
} from "../lib/yjsService.svelte";

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
export {
    cancelSchedule,
    createSchedule,
    exportSchedulesIcal,
    listSchedules,
    type Schedule,
    updateSchedule,
} from "./scheduleService";

// Import/Export Service
export {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "./importExportService";

// Attachment Service
export { deleteAttachment, listAttachments, uploadAttachment } from "./attachmentService";

// Project Service
export { renameProject } from "./projectService";
