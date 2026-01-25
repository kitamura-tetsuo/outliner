import "dotenv/config";
import { ChildProcess, spawn } from "child_process";
import { setupNgrokUrl } from "./utils/ngrok-helper.js";

// Local host configuration
const LOCAL_HOST = process.env.LOCAL_HOST || "localhost";

// Object to store server and ngrok processes
const processes: { ngrok: ChildProcess | null; server: ChildProcess | null; } = {
    ngrok: null,
    server: null,
};

// Cleanup on exit
function cleanup() {
    console.log("\nExecuting shutdown process...");

    if (processes.ngrok) {
        console.log("Stopping ngrok...");
        processes.ngrok.kill();
    }

    if (processes.server) {
        console.log("Stopping server...");
        processes.server.kill();
    }

    console.log("All processes stopped.");
    process.exit(0);
}

// Capture signals such as Ctrl+C
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

/**
 * Start ngrok
 * @param {number} port Port number to tunnel
 * @returns {Promise<boolean>} Whether startup was successful
 */
function startNgrok(port: number): Promise<boolean> {
    return new Promise(resolve => {
        console.log(`Starting ngrok (port: ${port})...`);

        const ngrok = spawn("ngrok", ["http", port.toString()], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        processes.ngrok = ngrok;

        let timeout: NodeJS.Timeout | null = null;

        // If URL cannot be obtained after 3 seconds, try obtaining it from API
        timeout = setTimeout(async () => {
            console.log("Waiting for ngrok to start...");
            resolve(true); // Proceed to next step
        }, 7071);

        ngrok.stdout.on("data", data => {
            console.log(`[ngrok] ${data.toString().trim()}`);
        });

        ngrok.stderr.on("data", data => {
            console.error(`[ngrok error] ${data.toString().trim()}`);
        });

        ngrok.on("close", code => {
            processes.ngrok = null;
            console.log(`ngrok exited (code: ${code})`);

            if (code !== 0 && processes.server) {
                console.log("Server will also stop because ngrok exited abnormally");
                processes.server.kill();
            }
        });

        ngrok.on("error", err => {
            if (timeout) clearTimeout(timeout);
            console.error("Error occurred while starting ngrok:", err);
            resolve(false);
        });
    });
}

/**
 * Start backend server
 * @returns {Promise<boolean>} Whether startup was successful
 */
function startServer(): Promise<boolean> {
    return new Promise(resolve => {
        console.log("Starting backend server...");

        const server = spawn("node", ["log-service.js"], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        processes.server = server;

        server.stdout.on("data", data => {
            console.log(`[server] ${data.toString().trim()}`);
        });

        server.stderr.on("data", data => {
            console.error(`[server error] ${data.toString().trim()}`);
        });

        server.on("close", code => {
            processes.server = null;
            console.log(`Server exited (code: ${code})`);

            if (code !== 0 && processes.ngrok) {
                console.log("ngrok will also stop because server exited abnormally");
                processes.ngrok.kill();
            }
        });

        server.on("error", err => {
            console.error("Error occurred while starting server:", err);
            resolve(false);
        });

        // Assume server has started
        setTimeout(() => resolve(true), 1000);
    });
}

/**
 * Start the application
 */
async function start() {
    try {
        const port = parseInt(process.env.PORT || "7071", 10);

        // Start ngrok
        const ngrokStarted = await startNgrok(port);
        if (!ngrokStarted) {
            console.error("Failed to start ngrok.");
            cleanup();
            return;
        }

        // Get ngrok URL and update .env
        console.log("Getting ngrok URL...");
        const ngrokUrl = await setupNgrokUrl();

        if (!ngrokUrl) {
            console.warn("Could not get ngrok URL.");
            console.warn("Google authentication callback may not work correctly.");
            console.warn("Please manually set GOOGLE_CALLBACK_URL in .env file.");
        } else {
            console.log("Got ngrok URL:", ngrokUrl);
            console.log("Updated callback URL:", `${ngrokUrl}/auth/google/callback`);
        }

        // Start server
        const serverStarted = await startServer();
        if (!serverStarted) {
            console.error("Failed to start server.");
            cleanup();
            return;
        }

        console.log("\n=====================================================");
        console.log("Application started successfully!");
        console.log(`Backend server: http://${LOCAL_HOST}:${port}`);
        if (ngrokUrl) {
            console.log(`Public URL: ${ngrokUrl}`);
        }
        console.log("Press Ctrl+C to exit.");
        console.log("=====================================================\n");
    } catch (error) {
        console.error("Error occurred during startup:", error);
        cleanup();
    }
}

// Start application
start();
