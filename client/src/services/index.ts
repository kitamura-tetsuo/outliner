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
    cleanupClient as cleanupYjsClient,
    createClient as createYjsClient,
    createNewProject as createNewYjsProject,
    getClientByProjectTitle as getYjsClientByProjectTitle,
    removeClientByProjectId as removeYjsClientByProjectId,
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
    importMarkdownIntoItem,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "./importExportService";

// Attachment Service
export { deleteAttachment, listAttachments, uploadAttachment } from "./attachmentService";

// Attachment Upload
export { handleFileUploadFromDrop } from "./attachmentUpload";
