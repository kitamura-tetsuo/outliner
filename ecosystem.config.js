require("@dotenvx/dotenvx").config({ path: ".env.test", overload: true });

module.exports = {
    apps: [
        {
            name: "yjs-server",
            script: "index.js",
            cwd: "./server",
            watch: false,
            env: {
                ...process.env,
            },
            out_file: "./logs/pm2/yjs-server-out.log",
            error_file: "./logs/pm2/yjs-server-error.log",
        },
        {
            name: "firebase-emulators",
            script: "firebase",
            args: "emulators:start",
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
            args: "run dev",
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
