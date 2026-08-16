import { Hocuspocus } from "@hocuspocus/server";
import express from "express";
import { z } from "zod";
import { checkContainerAccess as defaultCheckAccess } from "../access-control.js";
import { logger } from "../logger.js";
import { verifyIdTokenCached as defaultVerifyToken } from "../websocket-auth.js";
import { JobScheduler } from "./Scheduler.js";

const ScheduleRunRequestSchema = z.object({
    projectId: z.string().min(1).max(255),
    ruleId: z.string().min(1)
});

export function createScheduleRunRouter(
    hocuspocus: Hocuspocus,
    getScheduler: () => JobScheduler | undefined,
    overrides?: {
        checkContainerAccess?: typeof defaultCheckAccess;
        verifyIdTokenCached?: typeof defaultVerifyToken;
    }
) {
    const checkContainerAccess = overrides?.checkContainerAccess || defaultCheckAccess;
    const verifyIdTokenCached = overrides?.verifyIdTokenCached || defaultVerifyToken;
    const router = express.Router();

    router.post("/schedules/run-now", async (req, res) => {
        // Authentication Check
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            logger.warn({ event: "schedule_run_unauthorized", reason: "missing_token" });
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        let uid: string;
        try {
            const token = authHeader.split(" ")[1];
            const decoded = await verifyIdTokenCached(token);
            uid = decoded.uid;
        } catch (e) {
            logger.warn({
                event: "schedule_run_unauthorized",
                reason: "invalid_token",
                error: e instanceof Error ? e.message : String(e),
            });
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const validationResult = ScheduleRunRequestSchema.safeParse(req.body);
        if (!validationResult.success) {
            logger.warn({
                event: "schedule_run_invalid_request",
                errors: validationResult.error.format(),
            });
            res.status(400).json({
                error: "Invalid request body",
                details: validationResult.error.format(),
            });
            return;
        }

        const { projectId, ruleId } = validationResult.data;

        // Ensure projectId doesn't have slashes
        if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
            res.status(400).json({ error: "Invalid projectId" });
            return;
        }

        try {
            const hasAccess = await checkContainerAccess(uid, projectId);
            if (!hasAccess) {
                logger.warn({
                    event: "schedule_run_forbidden",
                    reason: "access_denied",
                    projectId,
                    uid,
                });
                res.status(403).json({ error: "Forbidden: You do not have access to this project" });
                return;
            }
        } catch (authError) {
            logger.error({ error: authError as Error, event: "schedule_run_auth_check_error" }, "schedule_run_auth_check_error");
            res.status(500).json({ error: "Internal Server Error during authorization check" });
            return;
        }

        const scheduler = getScheduler();
        if (!scheduler) {
            res.status(503).json({ error: "Scheduler is not running" });
            return;
        }

        try {
            const room = `projects/${projectId}`;
            const result = await scheduler.runRuleNow(room, ruleId);

            if (!result.success && result.error === "Rule not found") {
                res.status(404).json({ error: "Rule not found" });
                return;
            }

            if (!result.success && result.error?.startsWith("Missing required rule data")) {
                res.status(400).json({ error: result.error });
                return;
            }

            logger.info({ event: "schedule_run_now", projectId, ruleId, success: result.success });
            res.status(200).json({ ok: result.success, error: result.error });
        } catch (err) {
            logger.error({ err, event: "schedule_run_now_error" }, "Error running rule manually");
            res.status(500).json({ error: "Internal Server Error" });
        }
    });

    return router;
}
