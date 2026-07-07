import { uploadAttachment } from "./attachmentService";
import { getLogger } from "../lib/logger";

const logger = getLogger("attachmentUpload");

export interface AttachmentTarget {
    id: string | number;
    addAttachment?: (url: string) => void;
    attachments?: { push?: (arr: [string]) => void };
}

export function hasAttachments(obj: unknown): obj is { attachments: { push: (arr: [string]) => void } } {
    return !!obj && typeof obj === 'object' && 'attachments' in obj && typeof (obj as any).attachments?.push === 'function';
}

export function addAttachmentSafely(cand: AttachmentTarget, url: string, isTest: boolean = false) {
    try {
        if (cand.addAttachment) {
            cand.addAttachment(url);
        } else {
            throw new Error('Method addAttachment not found');
        }
    } catch {
        try {
            if (hasAttachments(cand)) {
                cand.attachments?.push?.([url]);
            }
        } catch {}
    }
    if (isTest && typeof window !== "undefined") {
        try {
            window.dispatchEvent(new CustomEvent('item-attachments-changed', {
                detail: { id: String(cand.id) }
            }));
        } catch {}
    }
}

export async function processAndUploadAttachment(
    containerId: string,
    itemId: string,
    file: File,
    onSuccess: (url: string) => void,
    onFallback?: (localUrl: string) => void
): Promise<void> {
    try {
        const url = await uploadAttachment(containerId, itemId, file);
        onSuccess(url);
    } catch (uploadErr) {
        logger.error({ error: uploadErr as Error }, "Attachment upload failed, using local fallback");

        try {
            const localUrl = URL.createObjectURL(file);
            if (onFallback) {
                onFallback(localUrl);
            } else {
                onSuccess(localUrl);
            }
        } catch (e) {
            logger.error({ error: e as Error }, "Fallback attachment creation failed");
        }
    }
}
