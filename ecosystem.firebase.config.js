/**
 * PM2 Ecosystem Configuration for Firebase Emulator
 *
 * Manages Firebase emulator services:
 * - auth (59099)
 * - firestore (58080)
 * - functions (57070)
 * - hosting (57000)
 * - storage (59200)
 */

const path = require("path");

const ROOT_DIR = path.resolve(__dirname);
const FUNCTIONS_DIR = path.join(ROOT_DIR, "functions");
const LOGS_DIR = path.join(ROOT_DIR, "server", "logs");

module.exports = {
    apps: [
        {
            name: "firebase-emulator",
            script: "firebase",
            args:
                "emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project outliner-d57b0",
            cwd: ROOT_DIR,
            env: {
                NODE_ENV: "test",
                FIREBASE_AUTH_EMULATOR_HOST: "localhost:59099",
                FIRESTORE_EMULATOR_HOST: "localhost:58080",
                FIREBASE_EMULATOR_HOST: "localhost:57070",
                AUTH_EMULATOR_HOST: "localhost:59099",
            },
            watch: false,
            autorestart: true,
            max_restarts: 3,
            min_uptime: 10000,
            kill_timeout: 15000,
            listen_timeout: 60000,
            log: path.join(LOGS_DIR, "firebase-emulator.log"),
            error_file: path.join(LOGS_DIR, "firebase-emulator-error.log"),
            out_file: path.join(LOGS_DIR, "firebase-emulator-out.log"),
            pid_file: path.join(LOGS_DIR, "firebase-emulator.pid"),
        },
    ],
};
