// Barrel file consolidating service exports
// Pattern to avoid circular dependencies

// Export FirestoreStore related functions
export {
    firestoreStore,
    getDefaultContainerId,
    saveContainerId,
    saveContainerIdToServer as saveFirestoreContainerIdToServer,
} from "../stores/firestoreStore.svelte";

// Yjs Service functions (Fluid replacement)
export {
    acquireDemoClient,
    cleanupClient as cleanupYjsClient,
    createClient as createYjsClient,
    createNewProject as createNewYjsProject,
    getClientByProjectTitle as getYjsClientByProjectTitle,
    releaseDemoClient,
    removeClientByProjectId as removeYjsClientByProjectId,
    resetDemoClientState,
} from "../lib/yjsService.svelte";

// SnapshotService
export { addSnapshot, getSnapshot, listSnapshots, replaceWithSnapshot, type Snapshot } from "./snapshotService";

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
    exportItemToMarkdown,
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "./importExportService";

// Attachment Service
export { deleteAttachment, listAttachments, uploadAttachment } from "./attachmentService";

// Attachment Upload
export { handleFileUploadFromDrop } from "./attachmentUpload";
