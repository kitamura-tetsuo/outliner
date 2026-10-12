import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyFirefoxExecution } from "./ci/verify-firefox-execution.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const client = path.join(root, "client");

function argumentsForRun(args) {
    let project;
    let config;
    const execution = [];
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === "--project" || argument.startsWith("--project=")) {
            if (project !== undefined) throw new Error("Select exactly one Firefox project per invocation.");
            project = argument === "--project" ? args[++index] : argument.slice("--project=".length);
        } else if (argument === "--config" || argument.startsWith("--config=")) {
            if (config !== undefined) throw new Error("Select exactly one Playwright configuration.");
            const value = argument === "--config" ? args[++index] : argument.slice("--config=".length);
            if (!value || value.startsWith("--")) throw new Error("--config requires a path.");
            config = path.resolve(value);
        } else {
            execution.push(argument);
        }
    }
    if (!project || !/^firefox-selection-[a-z0-9-]+$/.test(project)) {
        throw new Error("Use --project=<firefox-selection-project> to run one complete Firefox project.");
    }
    const shared = [`--project=${project}`, ...(config ? [`--config=${config}`] : [])];
    return {
        project,
        collection: [...shared, "--list", "--reporter=../scripts/tests/helpers/playwright-collection-reporter.mjs"],
        execution: [...shared, ...execution],
    };
}

function runPlaywright(args, environment, logFile) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(logFile);
        const child = spawn("npm", ["run", "github:test:e2e", "--", ...args], {
            cwd: client,
            env: environment,
            stdio: ["ignore", "pipe", "pipe"],
        });
        output.on("error", error => {
            child.kill("SIGTERM");
            reject(error);
        });
        child.stdout.on("data", chunk => {
            process.stdout.write(chunk);
            output.write(chunk);
        });
        child.stderr.on("data", chunk => {
            process.stderr.write(chunk);
            output.write(chunk);
        });
        child.on("error", error => {
            output.end(`${String(error)}\n`, () => reject(error));
        });
        child.on("close", (code, signal) => {
            output.end(() => resolve({ code: code ?? 1, signal }));
        });
    });
}

async function main() {
    const invocation = argumentsForRun(process.argv.slice(2));
    const executionId = process.env.E2E_EXECUTION_ID || `${Date.now()}-${process.pid}-${randomUUID().slice(0, 8)}`;
    const identity = `${invocation.project}-${executionId}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const logDirectory = path.join(root, "job_logs");
    const inventoryFile = path.resolve(
        client,
        process.env.E2E_EXPECTED_COLLECTION || `../job_logs/${identity}.collection.json`,
    );
    const reportFile = path.resolve(
        client,
        process.env.E2E_EXECUTION_REPORT || `../job_logs/${identity}.execution.json`,
    );
    if (inventoryFile === reportFile) throw new Error("Collection and execution evidence require distinct files.");
    fs.mkdirSync(logDirectory, { recursive: true });
    for (const file of [inventoryFile, reportFile]) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // A previous passing invocation must never satisfy this run's evidence boundary.
        fs.rmSync(file, { force: true });
    }
    const environment = {
        ...process.env,
        E2E_BROWSER: "firefox",
        E2E_PROJECT: invocation.project,
        E2E_EXECUTION_ID: executionId,
        E2E_EXPECTED_COLLECTION: inventoryFile,
        E2E_EXECUTION_REPORT: reportFile,
        PLAYWRIGHT_COLLECTION_E2E_DIR: path.join(client, "e2e"),
        PLAYWRIGHT_COLLECTION_OUTPUT: inventoryFile,
    };
    // A custom configuration owns its rootDir. The collection reporter uses that
    // same root when this explicit directory is absent, matching execution identities.
    if (invocation.collection.some(argument => argument.startsWith("--config="))) {
        delete environment.PLAYWRIGHT_COLLECTION_E2E_DIR;
    }
    console.log(`[Firefox CI] Project ${invocation.project}; execution ${executionId}`);
    for (const [phase, args] of [["collection", invocation.collection], ["execution", invocation.execution]]) {
        const result = await runPlaywright(args, environment, path.join(logDirectory, `${identity}.${phase}.log`));
        if (result.code !== 0) {
            console.error(
                `[Firefox CI] ${phase} failed (exit ${result.code}${
                    result.signal ? `, signal ${result.signal}` : ""
                }).`,
            );
            process.exitCode = result.code;
            return;
        }
    }
    const lock = JSON.parse(fs.readFileSync(path.join(client, "package-lock.json"), "utf8"));
    const result = verifyFirefoxExecution({
        inventoryFile,
        reportFile,
        project: invocation.project,
        executionId,
        playwrightVersion: lock.packages["node_modules/@playwright/test"].version,
    });
    console.log(
        `[Firefox CI] Verified ${result.cases} executed passing cases in ${result.project} (Firefox ${
            result.browserVersions.join(", ")
        }).`,
    );
}

main().catch(error => {
    console.error(`[Firefox CI] ${error.stack ?? String(error)}`);
    process.exitCode = 1;
});
