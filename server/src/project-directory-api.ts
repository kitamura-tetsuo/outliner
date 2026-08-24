import express from "express";
import type { Firestore } from "firebase-admin/firestore";
import {
    ensureProjectDescriptorForWrite,
    getAuthorizedProjectDescriptorForWrite,
    listAccessibleProjectDescriptors,
    ProjectDirectoryError,
    renameProject,
    resolveAccessibleProjectTitle,
} from "./project-directory.js";
import { verifyIdTokenCached } from "./websocket-auth.js";

type VerifyToken = typeof verifyIdTokenCached;

function errorStatus(error: ProjectDirectoryError): number {
    if (error.code === "forbidden") return 403;
    if (error.code === "not_found") return 404;
    if (error.code === "ambiguous_title" || error.code === "duplicate_title" || error.code === "title_conflict") {
        return 409;
    }
    return 400;
}

export function createProjectDirectoryRouter(options: {
    verifyToken?: VerifyToken;
    firestore?: Firestore;
} = {}) {
    const router = express.Router();
    const verifyToken = options.verifyToken ?? verifyIdTokenCached;

    router.use(async (req, res, next) => {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        try {
            res.locals.projectDirectoryUid = (await verifyToken(token)).uid;
            next();
        } catch {
            res.status(401).json({ error: "Unauthorized" });
        }
    });

    router.get("/", async (_req, res) => {
        try {
            res.json({
                projects: await listAccessibleProjectDescriptors(
                    res.locals.projectDirectoryUid as string,
                    options.firestore,
                ),
            });
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.get("/resolve", async (req, res) => {
        try {
            res.json(
                await resolveAccessibleProjectTitle(
                    res.locals.projectDirectoryUid as string,
                    req.query.title,
                    options.firestore,
                ),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.get("/:projectId", async (req, res) => {
        try {
            res.json(
                await getAuthorizedProjectDescriptorForWrite(
                    res.locals.projectDirectoryUid as string,
                    req.params.projectId,
                    options.firestore,
                ),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.post("/", async (req, res) => {
        try {
            res.status(201).json(
                await ensureProjectDescriptorForWrite(
                    res.locals.projectDirectoryUid as string,
                    req.body?.projectId,
                    req.body?.title,
                    options.firestore,
                ),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.post("/:projectId/rename", async (req, res) => {
        try {
            res.json(
                await renameProject(
                    res.locals.projectDirectoryUid as string,
                    req.params.projectId,
                    req.body?.title,
                    options.firestore,
                ),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    return router;
}
