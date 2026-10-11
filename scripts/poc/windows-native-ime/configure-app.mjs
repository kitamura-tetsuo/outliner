import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const path = join(process.argv[2], "firebase.emulator.json");
const config = JSON.parse(readFileSync(path, "utf8"));
// The editor's .env.test calls /api through Hosting on 57070. The repository's
// base firebase.json instead puts the direct Functions listener on that port.
// Preserve all rewrites and move only these two disposable emulator listeners.
config.emulators.hosting.port = 57070;
config.emulators.functions.port = 57071;
writeFileSync(path, JSON.stringify(config, null, 2));
