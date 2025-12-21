// Load environment variables from .env.test
// Note: dotenvx is loaded dynamically to avoid require path issues when PM2
// is invoked via npx. Falls back to process.env if dotenvx is not available.
try {
    require("@dotenvx/dotenvx").config({ path: ".env.test", overload: true });
} catch (e) {
    // dotenvx not available, use existing process.env
}

// Default port values matching scripts/common-config.sh
const TEST_YJS_PORT = process.env.TEST_YJS_PORT || "7093";
const VITE_PORT = process.env.VITE_PORT || "7090";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "outliner-d57b0";

module.exports = {
    apps: [
        {
            name: "yjs-server",
            script: "dist/index.js",
            cwd: "./server",
            watch: false,
            env: {
                ...process.env,
                DISABLE_Y_LEVELDB: "true",
                PORT: TEST_YJS_PORT,
            },
            out_file: "./logs/pm2/yjs-server-out.log",
            error_file: "./logs/pm2/yjs-server-error.log",
        },
        {
            name: "firebase-emulators",
            script: "npx",
            args:
                `firebase emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project ${FIREBASE_PROJECT_ID}`,
            cwd: "./",
            watch: false,
            env: {
                ...process.env,
            },
            out_file: "./logs/pm2/firebase-emulators-out.log",
            error_file: "./logs/pm2/firebase-emulators-error.log",
        },
        {
            name: "vite-server",
            script: "npm",
            args: `run dev -- --host 0.0.0.0 --port ${VITE_PORT}`,
            cwd: "./client",
            watch: false,
            env: {
                ...process.env,
            },
            out_file: "./logs/pm2/vite-server-out.log",
            error_file: "./logs/pm2/vite-server-error.log",
        },
    ],
};
