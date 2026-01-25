import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import pino from "pino";
import pretty from "pino-pretty";
import { fileURLToPath } from "url";

// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate server root directory correctly handling both src and dist structures
let serverRoot = path.resolve(__dirname, "..", "..");
if (path.basename(serverRoot) === "dist") {
    serverRoot = path.resolve(serverRoot, "..");
}

// Log directory path
// server/logs
const serverLogDir = path.join(serverRoot, "logs");
// client/logs
const clientLogDir = path.resolve(serverRoot, "..", "client", "logs");

// Log file path
export const serverLogPath = path.join(serverLogDir, "log-service.log");
// Check if it is a test environment
const isTestEnv = process.env.NODE_ENV === "test";
const clientLogFileName = isTestEnv ? "test-browser.log" : "browser.log";
export const clientLogPath = path.join(clientLogDir, clientLogFileName);
// File path for telemetry logs
const telemetryLogFileName = isTestEnv ? "test-telemetry.log" : "telemetry.log";
export const telemetryLogPath = path.join(clientLogDir, telemetryLogFileName);

// Check and create log directories
function ensureLogDirectories() {
    try {
        // Server log directory
        if (!fs.existsSync(serverLogDir)) {
            fs.mkdirSync(serverLogDir, { recursive: true });
            console.log(`Created server log directory: ${serverLogDir}`);
        }

        // Client log directory
        if (!fs.existsSync(clientLogDir)) {
            fs.mkdirSync(clientLogDir, { recursive: true });
            console.log(`Created client log directory: ${clientLogDir}`);
        }
    } catch (error: any) {
        console.warn(`Failed to create log directories: ${error.message}`);
        console.warn(`Server log directory: ${serverLogDir}`);
        console.warn(`Client log directory: ${clientLogDir}`);
        // Do not stop the application even if an error occurs
    }
}

// Ensure directories
ensureLogDirectories();

// Setup log streams for file transfer and formatted display
let serverLogStream: fs.WriteStream | null;
let clientLogStream: fs.WriteStream | null;
let telemetryLogStream: fs.WriteStream | null;

try {
    serverLogStream = fs.createWriteStream(serverLogPath, { flags: "a" });
} catch (error: any) {
    console.warn(`Failed to create server log stream: ${error.message}`);
    serverLogStream = null;
}

try {
    clientLogStream = fs.createWriteStream(clientLogPath, { flags: "a" });
} catch (error: any) {
    console.warn(`Failed to create client log stream: ${error.message}`);
    clientLogStream = null;
}

try {
    telemetryLogStream = fs.createWriteStream(telemetryLogPath, { flags: "a" });
} catch (error: any) {
    console.warn(`Failed to create telemetry log stream: ${error.message}`);
    telemetryLogStream = null;
}

const prettyStream = pretty({
    colorize: true,
    translateTime: "SYS:standard",
    levelFirst: true,
});
prettyStream.pipe(process.stdout);

// Logger setup for client logs
const clientStreams = [];
if (clientLogStream) {
    clientStreams.push({ stream: clientLogStream }); // Save raw logs to client log directory
}
// Only console if stream is unavailable
if (clientStreams.length === 0) {
    clientStreams.push({ stream: process.stdout });
}

export const clientLogger = pino(
    {
        level: "trace", // Collect logs of all levels
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(clientStreams),
);

// Logger setup for telemetry logs
const telemetryStreams = [];
if (telemetryLogStream) {
    telemetryStreams.push({ stream: telemetryLogStream }); // Save telemetry logs to a dedicated file
}
// Only console if stream is unavailable
if (telemetryStreams.length === 0) {
    telemetryStreams.push({ stream: process.stdout });
}

export const telemetryLogger = pino(
    {
        level: "trace", // Collect logs of all levels
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(telemetryStreams),
);

// Logger setup for server itself
const serverStreams: pino.StreamEntry[] = [{ stream: prettyStream }]; // Display formatted logs in console
if (serverLogStream) {
    serverStreams.push({ stream: serverLogStream }); // Save server logs to server log directory
}

export const serverLogger = pino(
    {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(serverStreams),
);

/**
 * Function to rotate log files
 * @param {string} logFilePath - Path of the log file to rotate
 * @param {number} maxBackups - Number of past log files to keep
 * @returns {Promise<boolean>} - true if successful
 */
export async function rotateLogFile(logFilePath: string, maxBackups = 2): Promise<boolean> {
    try {
        // Check if log file exists, create if not
        if (!await fsExtra.pathExists(logFilePath)) {
            console.log(`Log file does not exist. Creating: ${logFilePath}`);
            await fsExtra.ensureFile(logFilePath);
        }

        const directory = path.dirname(logFilePath);
        const basename = path.basename(logFilePath);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const timestamp = new Date().toISOString().replace(/:/g, "-");

        // Get list of old backup files (suffixes .1, .2, ...)
        const files = await fsExtra.readdir(directory);
        const backupFiles = files
            .filter(file => file.startsWith(basename + "."))
            .map(file => ({
                name: file,
                path: path.join(directory, file),
                // Extract suffix number from filename and convert to number
                suffix: parseInt(file.replace(basename + ".", ""), 10) || 0,
            }))
            // Sort by number descending
            .sort((a, b) => b.suffix - a.suffix);

        // Delete backup files exceeding max retention count
        for (let i = maxBackups; i < backupFiles.length; i++) {
            await fsExtra.remove(backupFiles[i].path);
            console.log(`Deleted old log file: ${backupFiles[i].path}`);
        }

        // Increment suffix number of existing backup files
        for (let i = 0; i < Math.min(backupFiles.length, maxBackups); i++) {
            const file = backupFiles[i];
            const newSuffix = file.suffix + 1;
            if (newSuffix <= maxBackups) {
                const newPath = path.join(directory, `${basename}.${newSuffix}`);
                await fsExtra.move(file.path, newPath, { overwrite: true });
                console.log(`Rotated log file: ${file.path} -> ${newPath}`);
            }
        }

        // Rename current log file with .1 suffix
        const backupPath = path.join(directory, `${basename}.1`);
        await fsExtra.move(logFilePath, backupPath, { overwrite: true });
        console.log(`Backed up current log file: ${logFilePath} -> ${backupPath}`);

        // Create new empty log file
        await fsExtra.ensureFile(logFilePath);
        console.log(`Created new log file: ${logFilePath}`);

        return true;
    } catch (error) {
        console.error("Error occurred during log rotation:", error);
        return false;
    }
}

/**
 * Rotate client log files
 * @param {number} maxBackups - Number of backups to keep
 * @returns {Promise<boolean>} - true if successful
 */
export async function rotateClientLogs(maxBackups = 2): Promise<boolean> {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(clientLogPath, maxBackups);
}

/**
 * Rotate telemetry log files
 * @param {number} maxBackups - Number of backups to keep
 * @returns {Promise<boolean>} - true if successful
 */
export async function rotateTelemetryLogs(maxBackups = 2): Promise<boolean> {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(telemetryLogPath, maxBackups);
}

/**
 * Rotate server log files
 * @param {number} maxBackups - Number of backups to keep
 * @returns {Promise<boolean>} - true if successful
 */
export async function rotateServerLogs(maxBackups = 2): Promise<boolean> {
    if (process.env.CI) {
        maxBackups = Number.MAX_SAFE_INTEGER;
    }
    return rotateLogFile(serverLogPath, maxBackups);
}

/**
 * Update client log stream
 * Used to create new stream after rotation
 */
export function refreshClientLogStream(): fs.WriteStream {
    try {
        // Safely close old stream
        if (clientLogStream) {
            clientLogStream.end();
        }

        // Create new stream
        const newClientLogStream = fs.createWriteStream(clientLogPath, { flags: "a" });

        // Update global variable in module
        clientLogStream = newClientLogStream;

        // Recreate pino-pretty stream
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: "SYS:standard",
            levelFirst: true,
        });
        newPrettyStream.pipe(process.stdout);

        // Create new multistream
        const newMultiStream = pino.multistream([
            { stream: newClientLogStream },
            { stream: newPrettyStream },
        ]);

        // Create new logger instance
        const newLogger = pino(
            {
                level: "trace",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // Replace properties of existing logger object with those of new logger
        Object.assign(clientLogger, newLogger);

        console.log("Updated client log stream");
        return newClientLogStream;
    } catch (error) {
        console.error("Client log stream update error:", error);
        // Even if error occurs, create and return new stream
        return fs.createWriteStream(clientLogPath, { flags: "a" });
    }
}

/**
 * Update telemetry log stream
 * Used to create new stream after rotation
 */
export function refreshTelemetryLogStream(): fs.WriteStream {
    try {
        // Safely close old stream
        if (telemetryLogStream) {
            telemetryLogStream.end();
        }

        // Create new stream
        const newTelemetryLogStream = fs.createWriteStream(telemetryLogPath, { flags: "a" });

        // Update global variable in module
        telemetryLogStream = newTelemetryLogStream;

        // Create new multistream
        const newMultiStream = pino.multistream([
            { stream: newTelemetryLogStream },
        ]);

        // Create new logger instance
        const newLogger = pino(
            {
                level: "trace",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // Replace properties of existing logger object with those of new logger
        Object.assign(telemetryLogger, newLogger);

        console.log("Updated telemetry log stream");
        return newTelemetryLogStream;
    } catch (error) {
        console.error("Telemetry log stream update error:", error);
        // Even if error occurs, create and return new stream
        return fs.createWriteStream(telemetryLogPath, { flags: "a" });
    }
}

/**
 * Update server log stream
 * Used to create new stream after rotation
 */
export function refreshServerLogStream(): fs.WriteStream {
    try {
        // Safely close old stream
        if (serverLogStream) {
            serverLogStream.end();
        }

        // Create new stream
        const newServerLogStream = fs.createWriteStream(serverLogPath, { flags: "a" });

        // Update global variable in module
        serverLogStream = newServerLogStream;

        // Recreate pino-pretty stream
        const newPrettyStream = pretty({
            colorize: true,
            translateTime: "SYS:standard",
            levelFirst: true,
        });
        newPrettyStream.pipe(process.stdout);

        // Create new multistream
        const newMultiStream = pino.multistream([
            { stream: newServerLogStream },
            { stream: newPrettyStream },
        ]);

        // Create new logger instance
        const newLogger = pino(
            {
                level: process.env.NODE_ENV === "production" ? "info" : "debug",
                timestamp: pino.stdTimeFunctions.isoTime,
            },
            newMultiStream,
        );

        // Replace properties of existing logger object with those of new logger
        Object.assign(serverLogger, newLogger);

        console.log("Updated server log stream");
        return newServerLogStream;
    } catch (error) {
        console.error("Server log stream update error:", error);
        // Even if error occurs, create and return new stream
        return fs.createWriteStream(serverLogPath, { flags: "a" });
    }
}

export const logger = serverLogger;

export default {
    rotateLogFile,
    rotateClientLogs,
    rotateTelemetryLogs,
    rotateServerLogs,
    refreshClientLogStream,
    refreshTelemetryLogStream,
    refreshServerLogStream,
    clientLogger,
    telemetryLogger,
    serverLogger,
    logger,
};
