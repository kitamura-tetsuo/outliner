import express from "express";
import type { Firestore } from "firebase-admin/firestore";
import {
    createFirestoreProjectDirectoryProvider,
    type ProjectDirectoryProvider,
} from "./project-directory-provider.js";
import { ProjectDirectoryError } from "./project-directory.js";
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
    provider?: ProjectDirectoryProvider;
} = {}) {
    const router = express.Router();
    const verifyToken = options.verifyToken ?? verifyIdTokenCached;
    const provider = options.provider ?? createFirestoreProjectDirectoryProvider(options.firestore);

    router.use("/projects", async (req, res, next) => {
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

    router.get("/projects", async (_req, res) => {
        try {
            res.json({
                projects: await provider.listDescriptors(res.locals.projectDirectoryUid as string),
            });
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.get("/projects/resolve", async (req, res) => {
        try {
            res.json(
                await provider.resolveTitle(res.locals.projectDirectoryUid as string, req.query.title),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.get("/projects/:projectId", async (req, res) => {
        try {
            res.json(
                await provider.getDescriptor(res.locals.projectDirectoryUid as string, req.params.projectId),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.post("/projects", async (req, res) => {
        try {
            res.status(201).json(
                await provider.ensureDescriptor(
                    res.locals.projectDirectoryUid as string,
                    req.body?.projectId,
                    req.body?.title,
                ),
            );
        } catch (error) {
            const status = error instanceof ProjectDirectoryError ? errorStatus(error) : 500;
            res.status(status).json({
                error: error instanceof ProjectDirectoryError ? error.message : "Request failed",
            });
        }
    });

    router.post("/projects/:projectId/rename", async (req, res) => {
        try {
            res.json(
                await provider.renameProject(
                    res.locals.projectDirectoryUid as string,
                    req.params.projectId,
                    req.body?.title,
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
