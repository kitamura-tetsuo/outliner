const fs = require('fs');

let content = fs.readFileSync('client/src/components/OutlinerItem.svelte', 'utf8');

content = content.replace(
    'import { uploadAttachment } from "../services/attachmentService";',
    'import { uploadAttachmentWithFallback } from "../services";'
);

const searchStr = `                    try {
                        const url = await uploadAttachment(containerId, model.id, file);

                        if (!dropTargetPosition || dropTargetPosition === "middle") {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            addAttachmentToDomTargetOrModel(event as any, url);
                            // Reflect to Doc after connection
                            try { mirrorAttachment(url); } catch {}
                        } else {
                            // Dispatch event for top/bottom insertion
                            dispatch("drop", {
                                targetItemId: model.id,
                                position: dropTargetPosition,
                                attachmentUrl: url
                            });
                        }

                    } catch (e) {
                        // Fallback with local preview even if upload fails (E2E stabilization)
                        try {
                            const localUrl = URL.createObjectURL(file);
                            if (!dropTargetPosition || dropTargetPosition === "middle") {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                try { model.original.addAttachment(localUrl); } catch { try { (model.original as any).attachments?.push?.([localUrl]); } catch {} }
                                try { mirrorAttachment(localUrl); } catch {}
                                // Immediate update of self-mirror in test environment - attachmentsMirror is handled in OutlinerItemAttachments component
                                try { if (IS_TEST) { window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(model.id) } })); } } catch {}
                            } else {
                                dispatch("drop", {
                                    targetItemId: model.id,
                                    position: dropTargetPosition,
                                    attachmentUrl: localUrl
                                });
                            }
                            // Auxiliary reflection to Doc after connection (via ID map)
                            try {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const w = (typeof window !== 'undefined') ? (window as any) : null;
                                const map = w?.__ITEM_ID_MAP__;
                                const mappedId = map ? map[String(model.id)] : undefined;
                                const curPage = w?.generalStore?.currentPage;
                                if (mappedId && curPage?.items) {
                                    for (let i = 0; i < (curPage.items.length || 0); i++) {
                                        const cand = curPage.items?.at ? curPage.items.at(i) : curPage.items?.[i];
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        if (cand && String(cand?.id) === String(mappedId)) { try { cand?.addAttachment?.(localUrl); } catch { try { (cand as any).attachments?.push?.([localUrl]); } catch {} } try { if (IS_TEST) window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: mappedId } })); } catch {} break; }
                                    }
                                }
                            } catch {}
                        } catch {}
                        logger.error({ error: e as Error }, "attachment upload failed");
                    }`;

const replaceStr = `                    await uploadAttachmentWithFallback(
                        containerId,
                        model.id,
                        file,
                        (url) => {
                            if (!dropTargetPosition || dropTargetPosition === "middle") {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                addAttachmentToDomTargetOrModel(event as any, url);
                                // Reflect to Doc after connection
                                try { mirrorAttachment(url); } catch {}
                            } else {
                                // Dispatch event for top/bottom insertion
                                dispatch("drop", {
                                    targetItemId: model.id,
                                    position: dropTargetPosition,
                                    attachmentUrl: url
                                });
                            }
                        },
                        (localUrl, err) => {
                            if (!dropTargetPosition || dropTargetPosition === "middle") {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                try { model.original.addAttachment(localUrl); } catch { try { (model.original as any).attachments?.push?.([localUrl]); } catch {} }
                                try { mirrorAttachment(localUrl); } catch {}
                                // Immediate update of self-mirror in test environment - attachmentsMirror is handled in OutlinerItemAttachments component
                                try { if (IS_TEST) { window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: String(model.id) } })); } } catch {}
                            } else {
                                dispatch("drop", {
                                    targetItemId: model.id,
                                    position: dropTargetPosition,
                                    attachmentUrl: localUrl
                                });
                            }
                            // Auxiliary reflection to Doc after connection (via ID map)
                            try {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const w = (typeof window !== 'undefined') ? (window as any) : null;
                                const map = w?.__ITEM_ID_MAP__;
                                const mappedId = map ? map[String(model.id)] : undefined;
                                const curPage = w?.generalStore?.currentPage;
                                if (mappedId && curPage?.items) {
                                    for (let i = 0; i < (curPage.items.length || 0); i++) {
                                        const cand = curPage.items?.at ? curPage.items.at(i) : curPage.items?.[i];
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        if (cand && String(cand?.id) === String(mappedId)) { try { cand?.addAttachment?.(localUrl); } catch { try { (cand as any).attachments?.push?.([localUrl]); } catch {} } try { if (IS_TEST) window.dispatchEvent(new CustomEvent('item-attachments-changed', { detail: { id: mappedId } })); } catch {} break; }
                                    }
                                }
                            } catch {}
                        },
                        logger
                    );`;

if (!content.includes(searchStr)) {
    console.log("Could not find the target string to replace in OutlinerItem.svelte");
} else {
    fs.writeFileSync('client/src/components/OutlinerItem.svelte', content.replace(searchStr, replaceStr));
    console.log("Updated OutlinerItem.svelte");
}
