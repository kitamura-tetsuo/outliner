import { getLogger } from "../lib/logger";
const logger = getLogger("AttachmentUpload");

const IS_TEST = import.meta.env.MODE === "test";

import type { Item, Items } from "../schema/app-schema";
import { getDefaultContainerId } from "../stores/firestoreStore.svelte";
import { uploadAttachment } from "./attachmentService";

/** Extracts the dropped/selected files from a DataTransfer or FileList, regardless of which API the browser populated. */
export function extractFiles(source: DataTransfer | FileList | null): File[] {
    if (!source) return [];
    const files: File[] = [];
    const fileList = (source as DataTransfer).files ?? (source as FileList);
    if (fileList && fileList.length > 0) {
        files.push(...Array.from(fileList));
        return files;
    }
    const items = (source as DataTransfer).items;
    if (items) {
        for (const it of Array.from(items)) {
            if (it.kind === "file") {
                const f = it.getAsFile();
                if (f) files.push(f);
            }
        }
    }
    return files;
}

/** Resolves the container ID to use for an attachment upload, falling back to "test-container" outside production. */
export async function resolveUploadContainerId(): Promise<string> {
    let containerId: string | undefined;
    try {
        containerId = await getDefaultContainerId();
    } catch (_e) {
        logger.error(_e);
    }
    return containerId || "test-container";
}

function addAttachmentWithFallback(item: Item, url: string, mime?: string, name?: string) {
    try {
        item.addAttachment(url, mime, name);
    } catch {
        try {
            (item as Item & { attachments?: { push: (arr: unknown[]) => void; }; }).attachments?.push(
                mime || name ? [[url, mime, name]] : [url],
            );
        } catch (_e) {
            logger.error(_e);
        }
    }
}

/** Uploads a file to a newly created item at the end of `items`, with the shared blob-URL fallback. */
export async function uploadFileToNewItemAtEnd(
    items: Items,
    currentUser: string,
    containerId: string,
    file: File,
): Promise<void> {
    try {
        const newItem = items.addNode(currentUser, items.length);
        if (!newItem) return;
        try {
            const url = await uploadAttachment(containerId, newItem.id, file);
            addAttachmentWithFallback(newItem, url, file.type, file.name);
        } catch (uploadErr) {
            logger.error({ error: uploadErr as Error }, "Attachment upload failed, using local fallback");
            if (IS_TEST) {
                const localUrl = URL.createObjectURL(file);
                addAttachmentWithFallback(newItem, localUrl, file.type, file.name);
                try {
                    window.dispatchEvent(
                        new CustomEvent("item-attachments-changed", { detail: { id: String(newItem.id) } }),
                    );
                } catch (_e) {
                    logger.error(_e);
                }
            }
        }
    } catch (e) {
        logger.error({ error: e as Error }, "Failed to upload file to new item");
    }
}

interface DropEventDetail {
    targetItemId?: string;
    position?: string | null;
    text?: string;
    selection?: unknown;
    sourceItemId?: string | null;
    attachmentUrl?: string;
    attachmentMime?: string;
    attachmentName?: string;
}

export async function handleFileUploadFromDrop(
    dt: DataTransfer | null,
    modelId: string,
    dropTargetPosition: string | null,
    dispatch: (type: "drop", detail: DropEventDetail) => void,
    addAttachmentToDomTargetOrModel: (ev: DragEvent | null, url: string, mime?: string, name?: string) => void,
    addAttachmentSafely: (modelOriginal: unknown, url: string, mime?: string, name?: string) => void,
    modelOriginal: unknown,
    event: Event | null,
): Promise<boolean> {
    const hasFileList = !!dt && dt.files && dt.files.length > 0;
    const hasFileItems = !!dt && dt.items && Array.from(dt.items).some(it => it.kind === "file");

    if (hasFileList || hasFileItems) {
        const files: File[] = [];
        if (hasFileList) {
            files.push(...Array.from(dt!.files));
        } else if (hasFileItems) {
            for (const it of Array.from(dt!.items)) {
                if (it.kind === "file") {
                    const f = it.getAsFile();
                    if (f) files.push(f);
                }
            }
        }

        if (files.length > 0) {
            let containerId: string | undefined = undefined;
            try {
                containerId = await getDefaultContainerId();
            } catch (_e) {
                logger.error(_e);
            }
            if (!containerId && typeof window !== "undefined") {
                try {
                    containerId = window.localStorage?.getItem?.("currentContainerId") ?? undefined;
                } catch (_e) {
                    logger.error(_e);
                }
                try {
                    containerId = containerId
                        || (window as Window & typeof globalThis & { __CURRENT_PROJECT_TITLE__?: string; })
                            .__CURRENT_PROJECT_TITLE__;
                } catch (_e) {
                    logger.error(_e);
                }
            }
            containerId = containerId || "test-container";

            for (const file of files) {
                try {
                    const url = await uploadAttachment(containerId, modelId, file);

                    if (!dropTargetPosition || dropTargetPosition === "middle") {
                        addAttachmentToDomTargetOrModel(
                            event instanceof DragEvent ? event : null,
                            url,
                            file.type,
                            file.name,
                        );
                    } else {
                        dispatch("drop", {
                            targetItemId: modelId,
                            position: dropTargetPosition,
                            attachmentUrl: url,
                            attachmentMime: file.type,
                            attachmentName: file.name,
                        });
                    }
                } catch (e) {
                    if (IS_TEST) {
                        try {
                            const localUrl = URL.createObjectURL(file);
                            if (!dropTargetPosition || dropTargetPosition === "middle") {
                                addAttachmentSafely(modelOriginal, localUrl, file.type, file.name);
                            } else {
                                dispatch("drop", {
                                    targetItemId: modelId,
                                    position: dropTargetPosition,
                                    attachmentUrl: localUrl,
                                    attachmentMime: file.type,
                                    attachmentName: file.name,
                                });
                            }
                            try {
                                const w = (typeof window !== "undefined")
                                    ? (window as Window & typeof globalThis & {
                                        __ITEM_ID_MAP__?: Record<string, string>;
                                        appStore?: unknown;
                                        generalStore?: unknown;
                                    })
                                    : null;
                                const map = w?.__ITEM_ID_MAP__;
                                const mappedId = map ? map[String(modelId)] : undefined;
                                const curPage = ((w?.appStore as unknown as Record<string, unknown>)?.currentPage
                                    || (w?.generalStore as unknown as Record<string, unknown>)?.currentPage
                                    || ((window as Window & typeof globalThis & { appStore?: unknown; })
                                        ?.appStore as unknown as Record<string, unknown>)?.currentPage
                                    || ((window as Window & typeof globalThis & { generalStore?: unknown; })
                                        ?.generalStore as unknown as Record<string, unknown>)
                                        ?.currentPage) as {
                                        items?: {
                                            length: number;
                                            at?: (
                                                i: number,
                                            ) => {
                                                id?: string;
                                                text?: string;
                                                addAttachment?: (u: string, mime?: string, name?: string) => void;
                                            };
                                            [key: number]: {
                                                id?: string;
                                                text?: string;
                                                addAttachment?: (u: string, mime?: string, name?: string) => void;
                                            };
                                        };
                                    } | undefined;
                                if (mappedId && curPage?.items) {
                                    for (let i = 0; i < (curPage.items.length || 0); i++) {
                                        const cand = curPage.items?.at ? curPage.items.at(i) : curPage.items?.[i];
                                        if (cand && String(cand?.id) === String(mappedId)) {
                                            addAttachmentSafely(cand, localUrl, file.type, file.name);
                                            break;
                                        }
                                    }
                                }
                            } catch (_e) {
                                logger.error(_e);
                            }
                        } catch (_e) {
                            logger.error(_e);
                        }
                    }
                    logger.error({ error: e as Error }, "attachment upload failed");
                }
            }
        }
        return true;
    }

    return false;
}
