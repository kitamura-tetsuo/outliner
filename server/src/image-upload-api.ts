import express, { Request, Response } from "express";
import admin from "firebase-admin";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { checkContainerAccess } from "./access-control.js";
import { validateApiKey } from "./api-keys-api.js";
import { logger } from "./logger.js";
import { Items, Project } from "./schema/app-schema.js";

// Use 'any' type for Hocuspocus to avoid ESM import issues
type HocuspocusInstance = any;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});

export function createImageUploadRouter(hocuspocus: HocuspocusInstance) {
    const router = express.Router();

    router.post(
        "/projects/:projectId/upload-image",
        validateApiKey,
        upload.single("file"),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId;
                const { uid } = (req as any).user;
                const file = (req as any).file;
                const { pageTitle, insertAfter, insertBefore } = req.body;

                if (!file) {
                    res.status(400).json({ error: "Missing file" });
                    return;
                }

                if (!pageTitle && !insertAfter && !insertBefore) {
                    res.status(400).json({
                        error: "Missing insertion target (pageTitle, insertAfter, or insertBefore)",
                    });
                    return;
                }

                // SECURITY: Check if user has access to the project
                const hasAccess = await checkContainerAccess(uid, projectId);
                if (!hasAccess) {
                    logger.warn({
                        event: "image_upload_forbidden",
                        reason: "access_denied",
                        projectId,
                        uid,
                    });
                    res.status(403).json({ error: "Forbidden: You do not have access to this project" });
                    return;
                }

                // 1. Upload to Firebase Storage
                const isEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.NODE_ENV === "development";
                const bucketName = isEmulator ? "test-project-id.appspot.com" : undefined;
                const bucket = admin.storage().bucket(bucketName);

                const fileName = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                const filePath = `attachments/${projectId}/api-upload/${fileName}`;
                const storageFile = bucket.file(filePath);

                const uploadOptions = {
                    metadata: {
                        contentType: file.mimetype,
                    },
                };

                await storageFile.save(file.buffer, uploadOptions);
                logger.info({ event: "image_upload_saved", filePath });

                // Generate URL
                let url: string;
                if (isEmulator) {
                    const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "localhost:59200";
                    url = `http://${storageHost}/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
                } else {
                    // Generate a virtually permanent signed URL for the image
                    const [signedUrl] = await storageFile.getSignedUrl({
                        action: "read",
                        expires: "01-01-2100", // virtually permanent
                    });
                    url = signedUrl;
                }

                logger.info({ event: "image_upload_url_generated", url });

                // 2. Insert into Yjs Document
                const projectRoom = `projects/${projectId}`;
                const directConnection = await hocuspocus.openDirectConnection(projectRoom, {
                    isSeeding: true,
                });

                let insertedId: string | undefined;

                try {
                    const doc = directConnection.document;
                    if (!doc) {
                        throw new Error("Failed to get document from direct connection");
                    }

                    await directConnection.transact((document: any) => {
                        const ydoc = document as unknown as Y.Doc;
                        const project = Project.fromDoc(ydoc);
                        const rootItems = project.items;

                        const markdownImage = `![image](${url})`;

                        if (insertAfter || insertBefore) {
                            const targetId = insertAfter || insertBefore;
                            let targetFound = false;

                            // Recursive search for the target node
                            const searchNode = (items: Items): boolean => {
                                for (const item of items) {
                                    if (item.id === targetId) {
                                        const parentItems = item.parent;
                                        if (parentItems) {
                                            const currentIndex = parentItems.indexOf(item);
                                            const targetIndex = insertAfter ? currentIndex + 1 : currentIndex;
                                            const newNode = parentItems.addNode(uid, targetIndex);
                                            newNode.updateText(markdownImage);
                                            insertedId = newNode.id;
                                            targetFound = true;
                                            return true;
                                        }
                                    }
                                    if (searchNode(item.items)) {
                                        return true;
                                    }
                                }
                                return false;
                            };

                            searchNode(rootItems);

                            if (!targetFound) {
                                throw new Error(`Target item ${targetId} not found`);
                            }
                        } else if (pageTitle) {
                            // Find page or create it
                            let page = null;
                            for (const item of rootItems) {
                                if (item.text === pageTitle) {
                                    page = item;
                                    break;
                                }
                            }

                            if (!page) {
                                page = project.addPage(pageTitle, uid);
                            }

                            const newNode = page.items.addNode(uid);
                            newNode.updateText(markdownImage);
                            insertedId = newNode.id;
                        }
                    });
                } catch (transactError: any) {
                    await directConnection.disconnect();
                    throw transactError;
                }

                await directConnection.disconnect();
                res.status(200).json({ success: true, url, insertedId });
            } catch (error: any) {
                logger.error({ event: "image_upload_error", error: error.message });
                res.status(500).json({ error: error.message || "Failed to upload image" });
            }
        },
    );

    return router;
}
