const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(process.argv[2]);
const expectedVersion = fs.readFileSync(path.join(root, ".firebase-tools-version"), "utf8").trim();
const resolved = spawnSync("where.exe", ["firebase.cmd"], { encoding: "utf8" });
const firebaseCommand = resolved.status === 0 ? resolved.stdout.split(/\r?\n/, 1)[0].trim() : "";
const firebaseEntry = firebaseCommand
    ? path.join(path.dirname(firebaseCommand), "node_modules", "firebase-tools", "lib", "bin", "firebase.js")
    : "";

if (!firebaseEntry || !fs.existsSync(firebaseEntry)) {
    console.error(`Firebase CLI ${expectedVersion} is not installed.`);
    process.exit(1);
}

const version = spawnSync(process.execPath, [firebaseEntry, "--version"], { encoding: "utf8" });
const installedVersion = version.status === 0 ? version.stdout.trim() : "";
if (installedVersion !== expectedVersion) {
    console.error(
        `Firebase CLI version mismatch: policy requires ${expectedVersion}, but PATH resolves ${
            installedVersion || "an unreadable version"
        }.`,
    );
    process.exit(1);
}

console.error(`Firebase CLI version: ${installedVersion}`);
const result = spawnSync(process.execPath, [firebaseEntry, ...process.argv.slice(3)], { stdio: "inherit" });
process.exit(result.status ?? 1);
