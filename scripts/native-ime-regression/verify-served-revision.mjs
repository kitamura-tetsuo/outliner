// Ties the application being served to the exact checkout under test.
//
// Usage: node verify-served-revision.mjs <application checkout> <client base URL> <output JSON>
//
// The served client source of the files carrying the #5501 behavior is fetched from the
// running Vite server (`?raw`) and compared byte-for-byte with the same paths at the
// checkout's HEAD commit. The application sources must also be free of tracked
// modifications, so the recorded SHA describes the code that was built and served. (Test
// startup regenerates emulator configuration files outside these source trees.)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const [checkout, base, output] = process.argv.slice(2);
if (!checkout || !base || !output) throw new Error("usage: <checkout> <base URL> <output JSON>");
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
const files = [
    "client/src/components/GlobalTextArea.svelte",
    "client/src/lib/KeyEventHandler.ts",
    "client/src/components/EditorOverlay.svelte",
];
const sha256 = text => createHash("sha256").update(text).digest("hex");
const result = {
    sha: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    trackedModifications: git(
        "status",
        "--porcelain",
        "--untracked-files=no",
        "--",
        "client/src",
        "server/src",
        "shared/src",
        "functions/src",
    ),
    servedFrom: base,
    files: [],
};
for (const path of files) {
    const committed = execFileSync("git", ["-C", checkout, "show", `HEAD:${path}`], { encoding: "utf8" });
    const response = await fetch(`${base}/${path.replace(/^client\//, "")}?raw`);
    const body = await response.text();
    // Vite serves `?raw` as an ES module whose default export is the JSON-encoded source.
    const match = /^export default (".*");?\s*$/s.exec(body);
    const served = match ? JSON.parse(match[1]) : null;
    result.files.push({
        path,
        status: response.status,
        committedSha256: sha256(committed),
        servedSha256: served === null ? null : sha256(served),
        matches: served === committed,
    });
}
result.verified = result.trackedModifications === "" && result.files.every(file => file.matches);
writeFileSync(output, JSON.stringify(result, null, 2));
if (!result.verified) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
}
console.log(`Served application verified at ${result.sha}`);
