const fs = require("fs");

let content = fs.readFileSync("client/src/components/OutlinerTree.svelte", "utf8");

content = content.replace(
    'import { uploadAttachment } from "../services/attachmentService";',
    'import { uploadAttachmentWithFallback } from "../services";',
);

const searchStr1 = `                    try {
                        const url = await uploadAttachment(containerId, newItem.id, file);
                        newItem.addAttachment(url);
                    } catch (uploadErr) {
                          console.error("Upload failed via file select", uploadErr);
                        // E2E fallback local URL for test environment (mocking network)
                        if (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __E2E__?: boolean }).__E2E__) {
                            const localUrl = URL.createObjectURL(file);
                            newItem.addAttachment(localUrl);
                            window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(newItem.id) } }));
                        }
                    }`;

const replaceStr1 = `                    await uploadAttachmentWithFallback(
                        containerId,
                        newItem.id,
                        file,
                        (url) => newItem.addAttachment(url),
                        (localUrl, err) => {
                            // E2E fallback local URL for test environment (mocking network)
                            if (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __E2E__?: boolean }).__E2E__) {
                                newItem.addAttachment(localUrl);
                                window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(newItem.id) } }));
                            }
                        }
                    );`;

const searchStr2 = `                            try {
                                const url = await uploadAttachment(containerId, newItem.id, file);
                                try {
                                    newItem.addAttachment(url);
                                } catch {
                                    try { (newItem as unknown as { attachments: [string][] }).attachments.push([url]); } catch {}
                                }
                            } catch (uploadErr) {
                                logger.error({ error: uploadErr as Error }, "Upload failed in tree bottom, using local fallback");
                                const localUrl = URL.createObjectURL(file);
                                try {
                                    newItem.addAttachment(localUrl);
                                } catch {
                                    try { (newItem as unknown as { attachments: [string][] }).attachments.push([localUrl]); } catch {}
                                }
                                try {
                                    if (import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __E2E__?: boolean }).__E2E__)) {
                                        window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(newItem.id) } }));
                                    }
                                } catch {}
                            }`;

const replaceStr2 = `                            await uploadAttachmentWithFallback(
                                containerId,
                                newItem.id,
                                file,
                                (url) => {
                                    try {
                                        newItem.addAttachment(url);
                                    } catch {
                                        try { (newItem as unknown as { attachments: [string][] }).attachments.push([url]); } catch {}
                                    }
                                },
                                (localUrl, err) => {
                                    try {
                                        newItem.addAttachment(localUrl);
                                    } catch {
                                        try { (newItem as unknown as { attachments: [string][] }).attachments.push([localUrl]); } catch {}
                                    }
                                    try {
                                        if (import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && (window as Window & typeof globalThis & { __E2E__?: boolean }).__E2E__)) {
                                            window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(newItem.id) } }));
                                        }
                                    } catch {}
                                },
                                logger
                            );`;

if (!content.includes(searchStr1)) {
    console.log("Could not find searchStr1 in OutlinerTree.svelte");
} else {
    content = content.replace(searchStr1, replaceStr1);
    console.log("Replaced searchStr1");
}

if (!content.includes(searchStr2)) {
    console.log("Could not find searchStr2 in OutlinerTree.svelte");
} else {
    content = content.replace(searchStr2, replaceStr2);
    console.log("Replaced searchStr2");
}

fs.writeFileSync("client/src/components/OutlinerTree.svelte", content);
