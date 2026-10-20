// Compare the evaluated commit with bytes actually served by Vite, including startup failures.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const files = [
    "client/src/components/GlobalTextArea.svelte",
    "client/src/lib/KeyEventHandler.ts",
    "client/src/components/EditorOverlay.svelte",
];
const sha256 = text => createHash("sha256").update(text).digest("hex");

export async function verifyServedRevision(checkout, base, output, {
    requestTimeoutMs = 10000,
    overallTimeoutMs = 45000,
    maxAttempts = 3,
} = {}) {
    const started = Date.now();
    const result = { verified: false, servedFrom: base, files: [], attempts: [] };
    const persist = () => writeFileSync(output, JSON.stringify(result, null, 2));
    const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
    try {
        result.sha = git("rev-parse", "HEAD");
        result.tree = git("rev-parse", "HEAD^{tree}");
        result.trackedModifications = git(
            "status",
            "--porcelain",
            "--untracked-files=no",
            "--",
            "client/src",
            "server/src",
            "shared/src",
            "functions/src",
        );
        for (const path of files) {
            const committed = execFileSync("git", ["-C", checkout, "show", `HEAD:${path}`], { encoding: "utf8" });
            const url = `${base}/${path.replace(/^client\//, "")}?raw`;
            let body;
            let status;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const observation = { path, url, phase: "request", attempt, elapsedMs: Date.now() - started };
                result.attempts.push(observation);
                persist();
                const remaining = overallTimeoutMs - (Date.now() - started);
                try {
                    if (remaining <= 0) {
                        throw Object.assign(new Error("Overall identity acquisition deadline exceeded"), {
                            code: "OVERALL_TIMEOUT",
                        });
                    }
                    const response = await fetch(url, {
                        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
                    });
                    observation.phase = "body";
                    observation.status = response.status;
                    persist();
                    body = await response.text();
                    status = response.status;
                    observation.phase = "received";
                    observation.elapsedMs = Date.now() - started;
                    persist();
                    break;
                } catch (error) {
                    observation.error = {
                        message: error.message,
                        code: error.name === "TimeoutError"
                            ? "TimeoutError"
                            : error.cause?.code ?? error.code ?? error.name,
                    };
                    observation.elapsedMs = Date.now() - started;
                    persist();
                    const transient = [
                        "ECONNRESET",
                        "ECONNREFUSED",
                        "UND_ERR_SOCKET",
                        "UND_ERR_CONNECT_TIMEOUT",
                        "TimeoutError",
                    ]
                        .includes(observation.error.code);
                    if (!transient || attempt === maxAttempts || Date.now() - started >= overallTimeoutMs) throw error;
                }
            }
            // ?raw is an ES module containing the JSON-encoded committed source.
            const match = /^export default (".*");?\s*$/s.exec(body);
            const served = match ? JSON.parse(match[1]) : undefined;
            result.files.push({
                path,
                status,
                committedSha256: sha256(committed),
                servedSha256: served === undefined ? null : sha256(served),
                matches: status === 200 && served === committed,
            });
            persist();
        }
        result.verified = result.trackedModifications === "" && result.files.every(file => file.matches);
        if (!result.verified) {
            result.failure = {
                kind: "mismatch",
                message: "Tracked source or served bytes differ from the evaluated commit",
            };
        }
    } catch (error) {
        result.failure = {
            kind: "unavailable",
            message: error.message,
            code: error.name === "TimeoutError" ? "TimeoutError" : error.cause?.code ?? error.code ?? error.name,
        };
    } finally {
        result.elapsedMs = Date.now() - started;
        persist();
    }
    return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [checkout, base, output] = process.argv.slice(2);
    if (!checkout || !base || !output) throw new Error("usage: <checkout> <base URL> <output JSON>");
    const result = await verifyServedRevision(checkout, base, output);
    if (!result.verified) {
        console.error(JSON.stringify(result, null, 2));
        process.exitCode = 1;
    } else console.log(`Served application verified at ${result.sha}`);
}
