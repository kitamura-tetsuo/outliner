// Environment variables are loaded via common-config.sh before PM2 starts
// and passed through the 'env' section in each app configuration.
//
// Note: Firebase emulators are started directly by setup.sh (not via PM2) because
// they don't work well under process managers due to their multi-process architecture.

module.exports = {
    apps: [
        {
            name: "yjs-server",
            script: "npm",
            args: "start",
            cwd: "./server",
            env: {
                // Explicit port must come AFTER process.env spread to ensure it's used
                // when PORT is not already set in the environment
                ...process.env,
                NODE_ENV: "test",
                PORT: 7093,
            },
            log_file: "./logs/yjs-server.log",
            out_file: "../logs/yjs-server.log",
            error_file: "../logs/yjs-server.log",
            log_date_format: "YYYY-MM-DD HH:mm:s",
        },
        {
            name: "vite-server",
            script: "npm",
            args: "run dev -- --host 0.0.0.0 --port 7090 --mode test",
            cwd: "./client",
            env: {
                ...process.env,
                NODE_ENV: "test",
                // VITE_PORT will be used by the client's vite.config.ts
                VITE_PORT: 7090,
            },
            log_file: "./logs/vite-server.log",
            out_file: "../logs/vite-server.log",
            error_file: "../logs/vite-server.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",
        },
        {
            name: "firebase-emulators",
            script: "firebase",
            args:
                "emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project outliner-d57b0",
            cwd: ".",
            env: {
                ...process.env,
                NODE_ENV: "test",
            },
            log_file: "./logs/firebase-emulators.log",
            out_file: "./logs/firebase-emulators.log",
            error_file: "./logs/firebase-emulators.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",
        },
    ],
};
