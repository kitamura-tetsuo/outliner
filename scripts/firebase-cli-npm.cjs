const { spawnSync } = require("node:child_process");
const path = require("node:path");

const launcher = process.platform === "win32"
    ? [process.execPath, path.join(__dirname, "firebase-cli-windows.cjs"), path.join(__dirname, "..")]
    : [path.join(__dirname, "firebase-cli.sh")];
const result = spawnSync(launcher[0], [...launcher.slice(1), ...process.argv.slice(2)], { stdio: "inherit" });

if (result.error) {
    console.error(`Unable to launch Firebase CLI: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);
