/**
 * PM2 Ecosystem Configuration for Test Environment
 *
 * Manages all test services (Yjs, Firebase, Vite) with:
 * - Automatic restart on crash
 * - Centralized logging
 * - Idempotent startup (pm2 start = ensure running)
 */

const path = require("path");
const os = require("os");

const ROOT_DIR = path.resolve(__dirname);
const SERVER_DIR = path.join(ROOT_DIR, "server");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const FUNCTIONS_DIR = path.join(ROOT_DIR, "functions");
const LOGS_DIR = path.join(ROOT_DIR, "server", "logs");

// Environment configuration
const env = {
    NODE_ENV: "test",
    TEST_ENV: "localhost",
    FIREBASE_PROJECT_ID: "outliner-d57b0",
    VITE_IS_TEST: "true",
    VITE_USE_FIREBASE_EMULATOR: "true",
    VITE_FIREBASE_EMULATOR_HOST: "localhost",
    VITE_USE_TINYLICIOUS: "true",
};

module.exports = {
    apps: [
        // Yjs WebSocket Server
        {
            name: "yjs-server",
            script: "npm",
            cwd: SERVER_DIR,
            args: "start",
            env: {
                ...env,
                PORT: 7093,
            },
            env_file: path.join(SERVER_DIR, ".env.test"),
            node_args: "--experimental-network-inspection",
            watch: false,
            autorestart: true,
            max_restarts: 5,
            min_uptime: 5000,
            kill_timeout: 10000,
            listen_timeout: 30000,
            log: path.join(LOGS_DIR, "yjs-websocket.log"),
            error_file: path.join(LOGS_DIR, "yjs-websocket-error.log"),
            out_file: path.join(LOGS_DIR, "yjs-websocket-out.log"),
            pid_file: path.join(LOGS_DIR, "yjs-websocket.pid"),
            max_memory_restart: "500M",
        },

        // SvelteKit Client Server
        {
            name: "sveltekit-server",
            script: "npm",
            cwd: CLIENT_DIR,
            args: "run dev -- --host 0.0.0.0 --port 7090",
            env: {
                ...env,
                PORT: 7090,
            },
            env_file: path.join(CLIENT_DIR, ".env.test"),
            node_args: "--experimental-network-inspection",
            watch: false,
            autorestart: true,
            max_restarts: 5,
            min_uptime: 5000,
            kill_timeout: 10000,
            listen_timeout: 30000,
            log: path.join(LOGS_DIR, "test-svelte-kit.log"),
            error_file: path.join(LOGS_DIR, "test-svelte-kit-error.log"),
            out_file: path.join(LOGS_DIR, "test-svelte-kit-out.log"),
            pid_file: path.join(LOGS_DIR, "test-svelte-kit.pid"),
            max_memory_restart: "1G",
        },

        // API Server (legacy)
        {
            name: "api-server",
            script: "npm",
            cwd: SERVER_DIR,
            args: "run dev -- --host 0.0.0.0 --port 7091",
            env: {
                ...env,
                PORT: 7091,
            },
            env_file: path.join(SERVER_DIR, ".env.test"),
            node_args: "--experimental-network-inspection",
            watch: false,
            autorestart: true,
            max_restarts: 5,
            min_uptime: 5000,
            kill_timeout: 10000,
            listen_timeout: 30000,
            log: path.join(LOGS_DIR, "test-log-service-tee.log"),
            error_file: path.join(LOGS_DIR, "test-log-service-tee-error.log"),
            out_file: path.join(LOGS_DIR, "test-log-service-tee-out.log"),
            pid_file: path.join(LOGS_DIR, "test-log-service-tee.pid"),
            max_memory_restart: "500M",
        },
    ],
};
