import "@dotenvx/dotenvx";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import { initializeFirebase } from "./firebase-init.js";
import {
    clientLogger,
    refreshClientLogStream,
    refreshServerLogStream,
    refreshTelemetryLogStream,
    rotateClientLogs,
    rotateServerLogs,
    rotateTelemetryLogs,
    serverLogger as logger,
    telemetryLogger,
    telemetryLogPath,
} from "./utils/log-manager.js";

const isDevelopment = process.env.NODE_ENV !== "production";

async function startServer() {
    try {
        await initializeFirebase();
        logger.info("Firebase initialization completed, starting log service...");
        return startLogService();
    } catch (error: any) {
        logger.error(`Failed to initialize Firebase: ${error.message}`);
        throw error;
    }
}

function startLogService() {
    const LOG_ROTATION_INTERVAL = parseInt(process.env.LOG_ROTATION_INTERVAL || "86400000", 10); // Default: 24 hours
    const periodicLogRotation = async () => {
        try {
            logger.info("Performing scheduled periodic log rotation");
            const clientRotated = await rotateClientLogs(2);
            const telemetryRotated = await rotateTelemetryLogs(2);
            const serverRotated = await rotateServerLogs(2);

            if (clientRotated) {
                refreshClientLogStream();
            }

            if (telemetryRotated) {
                refreshTelemetryLogStream();
            }

            if (serverRotated) {
                refreshServerLogStream();
            }

            logger.info(`Periodic log rotation completed: ${
                JSON.stringify({
                    clientRotated,
                    telemetryRotated,
                    serverRotated,
                    timestamp: new Date().toISOString(),
                })
            }`);
        } catch (error: any) {
            logger.error(`Error during periodic log rotation: ${error.message}`);
        }
    };

    const logRotationTimer = setInterval(periodicLogRotation, LOG_ROTATION_INTERVAL);

    const app = express();

    function getSafeOrigins() {
        const defaultOrigins = ["http://localhost:7070"];

        if (!process.env.CORS_ORIGIN) {
            logger.info("CORS_ORIGIN not set, using default origins");
            return defaultOrigins;
        }

        try {
            const origins = process.env.CORS_ORIGIN.split(",").map(origin => origin.trim());
            const safeOrigins = origins.filter(origin => {
                try {
                    new URL(origin);
                    if (origin.includes("pathToRegexpError") || origin.includes("git.new")) {
                        logger.warn(`Filtering out invalid origin: ${origin}`);
                        return false;
                    }
                    return true;
                } catch (e) {
                    logger.warn(`Invalid origin URL format: ${origin}`);
                    return false;
                }
            });

            if (safeOrigins.length === 0) {
                logger.warn("No valid origins found in CORS_ORIGIN, using defaults");
                return defaultOrigins;
            }

            logger.info(`Using CORS origins: ${safeOrigins.join(", ")}`);
            return safeOrigins;
        } catch (error: any) {
            logger.error(`Error parsing CORS_ORIGIN: ${error.message}, using defaults`);
            return defaultOrigins;
        }
    }

    app.use(cors({
        origin: getSafeOrigins(),
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
    }));

    app.use((req, res, next) => {
        if (req.method === "OPTIONS") {
            res.header("Access-Control-Allow-Origin", getSafeOrigins().join(", "));
            res.header("Vary", "Origin");
            res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
            res.sendStatus(204);
            return;
        }
        next();
    });

    app.use(express.json());
    app.use(bodyParser.json());

    app.get("/health", (req, res) => {
        res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
    });

    app.post("/api/login", async (req, res): Promise<any> => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ error: "Email and password are required" });
            }

            if (isDevelopment) {
                try {
                    const userRecord = await admin.auth().getUserByEmail(email);
                    const testUserPassword = process.env.TEST_USER_PASSWORD;

                    if (
                        testUserPassword && email === "test@example.com"
                        && password === testUserPassword
                    ) {
                        const customToken = await admin.auth().createCustomToken(userRecord.uid, {
                            devUser: true,
                            role: "admin",
                        });

                        return res.status(200).json({
                            customToken,
                            user: {
                                uid: userRecord.uid,
                                email: userRecord.email,
                                displayName: userRecord.displayName,
                            },
                        });
                    }
                } catch (error: any) {
                    logger.error(`Development login error: ${error.message}`);
                }
            }
            return res.status(401).json({ error: "Invalid credentials" });
        } catch (error: any) {
            logger.error(`Login error: ${error.message}`);
            return res.status(500).json({ error: "Authentication failed" });
        }
    });

    app.post("/api/log", (req, res): any => {
        try {
            const logData = req.body;
            if (!logData || !logData.level || !logData.log) {
                logger.warn(`Received invalid log format: ${JSON.stringify({ receivedData: logData })}`);
                return res.status(400).json({ error: "Invalid log format" });
            }

            const enrichedLog = {
                ...logData,
                clientIp: req.ip || "unknown",
                timestamp: logData.timestamp || new Date().toISOString(),
                source: "client",
            };

            const isTelemetryLog = logData.isTelemetry === true;
            const targetLogger = isTelemetryLog ? telemetryLogger : clientLogger;

            switch (logData.level.toLowerCase()) {
                case "trace":
                    targetLogger.trace(JSON.stringify(enrichedLog));
                    break;
                case "debug":
                    targetLogger.debug(JSON.stringify(enrichedLog));
                    break;
                case "info":
                    targetLogger.info(JSON.stringify(enrichedLog));
                    break;
                case "warn":
                    targetLogger.warn(JSON.stringify(enrichedLog));
                    break;
                case "error":
                    targetLogger.error(JSON.stringify(enrichedLog));
                    break;
                case "fatal":
                    targetLogger.fatal(JSON.stringify(enrichedLog));
                    break;
                default:
                    targetLogger.info(JSON.stringify(enrichedLog));
            }

            return res.status(200).json({ success: true });
        } catch (error: any) {
            logger.error(`Log processing error: ${error.message}`);
            return res.status(500).json({ error: "Failed to process log" });
        }
    });

    if (isDevelopment) {
        app.get("/api/telemetry-logs", (req, res): any => {
            try {
                if (!fs.existsSync(telemetryLogPath)) {
                    return res.status(404).json({ error: "Telemetry log file not found" });
                }

                const stats = fs.statSync(telemetryLogPath);
                const fileSizeInBytes = stats.size;
                const MAX_SIZE = 1024 * 1024; // 1MB
                let position = Math.max(0, fileSizeInBytes - MAX_SIZE);
                let length = fileSizeInBytes - position;

                fs.open(telemetryLogPath, "r", (err, fd) => {
                    if (err) {
                        logger.error(`Failed to open Telemetry log file: ${err.message}`);
                        res.status(500).json({ error: "Failed to open file" });
                        return;
                    }

                    const buffer = Buffer.alloc(length);
                    fs.read(fd, buffer, 0, length, position, (err, bytesRead, buffer) => {
                        fs.close(fd, () => {});

                        if (err) {
                            logger.error(`Failed to read Telemetry log file: ${err.message}`);
                            res.status(500).json({ error: "Failed to read file" });
                            return;
                        }

                        const data = buffer.toString("utf8");
                        const lines = data.split("\n").filter(line => line.trim());
                        const logs = lines.map(line => {
                            try {
                                return JSON.parse(line);
                            } catch (e) {
                                return { raw: line };
                            }
                        });

                        res.status(200).json({
                            logs,
                            totalSize: fileSizeInBytes,
                            readSize: bytesRead,
                            truncated: position > 0,
                        });
                    });
                });
            } catch (error: any) {
                logger.error(`Telemetry log retrieval error: ${error.message}`);
                return res.status(500).json({ error: "Failed to retrieve Telemetry log" });
            }
        });
    }

    app.post("/api/rotate-logs", async (req, res) => {
        try {
            const clientRotated = await rotateClientLogs(2);
            const telemetryRotated = await rotateTelemetryLogs(2);
            const serverRotated = await rotateServerLogs(2);

            if (clientRotated) {
                refreshClientLogStream();
            }
            if (telemetryRotated) {
                refreshTelemetryLogStream();
            }
            if (serverRotated) {
                refreshServerLogStream();
            }

            res.status(200).json({
                success: true,
                clientRotated,
                telemetryRotated,
                serverRotated,
                timestamp: new Date().toISOString(),
            });

            logger.info(`Rotated log files: ${
                JSON.stringify({
                    clientRotated,
                    telemetryRotated,
                    serverRotated,
                    timestamp: new Date().toISOString(),
                })
            }`);
        } catch (error: any) {
            logger.error(`Error occurred during log rotation: ${error.message}`);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    });

    if (process.env.NODE_ENV !== "production") {
        app.get("/debug/token-info", async (req, res): Promise<any> => {
            try {
                const { token } = req.query;

                if (!token) {
                    return res.status(400).json({ error: "Token is required" });
                }

                const decoded = jwt.decode(token as string, { complete: true });

                if (!decoded) {
                    return res.status(400).json({ error: "Invalid JWT token" });
                }

                const payload = decoded.payload as jwt.JwtPayload;
                return res.json({
                    header: decoded.header,
                    payload: payload,
                    expiresIn: payload.exp ? new Date(payload.exp * 1000).toISOString() : "N/A",
                    issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : "N/A",
                });
            } catch (error: any) {
                return res.status(500).json({ error: `Failed to retrieve token information: ${error.message}` });
            }
        });
    }

    app.post("/api/create-test-user", async (req, res): Promise<any> => {
        if (process.env.NODE_ENV === "production") {
            return res.status(403).json({ error: "Not available in production" });
        }

        const { email, password, displayName } = req.body;

        if (!email || !password || !displayName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        try {
            const auth = admin.auth();

            try {
                const existingUser = await auth.getUserByEmail(email);
                return res.status(200).json({
                    message: "User already exists",
                    uid: existingUser.uid,
                });
            } catch (error: any) {
                if (error.code !== "auth/user-not-found") {
                    throw error;
                }
            }

            const userRecord = await auth.createUser({
                email,
                password,
                displayName,
                emailVerified: true,
            });

            await auth.setCustomUserClaims(userRecord.uid, {
                devUser: true,
                role: "user",
            });

            logger.info(`Successfully created test user: ${userRecord.uid}`);
            return res.status(200).json({
                message: "User created successfully",
                uid: userRecord.uid,
            });
        } catch (error: any) {
            logger.error(`Error creating test user: ${error.message}`);
            return res.status(500).json({ error: error.message });
        }
    });

    const PORT = process.env.PORT || 7071;
    app.listen(PORT, () => {
        logger.info(`Auth service running on port ${PORT}`);
        logger.info(`CORS origin: ${process.env.CORS_ORIGIN || "*"}`);
    });

    return app;
}

startServer().catch(error => {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
});
