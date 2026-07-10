import { getLogger } from "../lib/logger";
import { uploadAttachment } from "./attachmentService";

const logger = getLogger("attachmentUpload");

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export async function uploadAttachmentWithFallback(
    containerId: string,
    itemId: string,
    file: File,
    onSuccess: (url: string) => void,
    onFallback: (localUrl: string, error: unknown) => void,
    callerLogger?: { error: (msg: string | { error: Error; }, details?: string) => void; },
): Promise<void> {
    const log = callerLogger || logger;

    if (file.size > MAX_FILE_SIZE_BYTES) {
        log.error(`File size exceeds limit of ${MAX_FILE_SIZE_MB}MB.`);
        // To maintain previous behavior where it falls back if it "fails" (even for size),
        // we'll invoke the fallback here too, mimicking an upload failure.
        try {
            const localUrl = URL.createObjectURL(file);
            onFallback(localUrl, new Error("File too large"));
        } catch (fallbackErr) {
            log.error({ error: fallbackErr as Error }, "fallback local URL creation failed");
        }
        return;
    }

    try {
        const url = await uploadAttachment(containerId, itemId, file);
        onSuccess(url);
    } catch (e) {
        log.error({ error: e as Error }, "attachment upload failed");

        try {
            const localUrl = URL.createObjectURL(file);
            onFallback(localUrl, e);
        } catch (fallbackErr) {
            log.error({ error: fallbackErr as Error }, "fallback local URL creation failed");
        }
    }
}
