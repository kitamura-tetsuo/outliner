#!/usr/bin/env node

/**
 * Production Data Management Integration Script
 *
 * Usage:
 * node scripts/production-data-manager.js [command] [options]
 *
 * Commands:
 * - check: Check environment
 * - backup: Backup data
 * - delete: Delete data (requires confirmation)
 * - help: Show help
 */

import { spawn } from "child_process";
import path from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colored log output
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Function to run child process
function runScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn("node", [scriptPath, ...args], {
            stdio: "inherit",
            cwd: path.dirname(__dirname),
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`Script exited with code ${code}`));
            }
        });

        child.on("error", (error) => {
            reject(error);
        });
    });
}

// Show help
function showHelp() {
    log("=".repeat(70), "cyan");
    log("Production Data Management Integration Script", "cyan");
    log("=".repeat(70), "cyan");
    log("");
    log("Usage:", "blue");
    log("  node scripts/production-data-manager.js [command] [options]", "yellow");
    log("");
    log("Commands:", "blue");
    log("  check                    - Check current environment", "green");
    log("  backup                   - Backup production data", "green");
    log("  delete --confirm         - Delete production data (requires confirmation)", "red");
    log("  delete --confirm --force - Delete production data (force execution)", "red");
    log("  help                     - Show this help", "green");
    log("");
    log("Examples:", "blue");
    log("  node scripts/production-data-manager.js check", "yellow");
    log("  node scripts/production-data-manager.js backup", "yellow");
    log("  node scripts/production-data-manager.js delete --confirm", "yellow");
    log("");
    log("⚠️  Warnings:", "red");
    log("  - The delete command deletes all data in the production environment", "red");
    log("  - Be sure to create a backup with the backup command before execution", "red");
    log("  - The deletion operation cannot be undone", "red");
    log("");
}

// Execute environment check
async function runCheck() {
    log("🔍 Running environment check...", "blue");
    log("");

    try {
        await runScript(path.join(__dirname, "check-production-environment.js"));
        log("");
        log("✅ Environment check complete", "green");
    } catch (error) {
        if (error.message.includes("code 1")) {
            log("");
            log("⚠️  Production environment detected", "yellow");
            log("   Please be very careful when manipulating data", "yellow");
        } else {
            throw error;
        }
    }
}

// Execute backup
async function runBackup() {
    log("💾 Running data backup...", "blue");
    log("");

    try {
        await runScript(path.join(__dirname, "backup-production-data.js"));
        log("");
        log("✅ Backup complete", "green");
    } catch (error) {
        log("");
        log("❌ Backup failed", "red");
        throw error;
    }
}

// Execute data deletion
async function runDelete(options) {
    log("🗑️  Running data deletion...", "red");
    log("");

    const args = [];
    if (options.confirm) args.push("--confirm");
    if (options.force) args.push("--force");

    try {
        await runScript(path.join(__dirname, "delete-production-data.js"), args);
        log("");
        log("✅ Data deletion complete", "green");
    } catch (error) {
        log("");
        log("❌ Data deletion failed", "red");
        throw error;
    }
}

// Execute full workflow
async function runFullWorkflow(options) {
    log("🚀 Running full data deletion workflow", "cyan");
    log("");

    try {
        // 1. Environment check
        log("Step 1/3: Environment check", "blue");
        await runCheck();
        log("");

        // 2. Backup
        log("Step 2/3: Data backup", "blue");
        await runBackup();
        log("");

        // 3. Data deletion
        log("Step 3/3: Data deletion", "blue");
        await runDelete(options);
        log("");

        log("🎉 All processes completed", "green");
    } catch (error) {
        log("❌ Workflow interrupted", "red");
        throw error;
    }
}

// Main process
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const options = {
        confirm: args.includes("--confirm"),
        force: args.includes("--force"),
        full: args.includes("--full"),
    };

    try {
        switch (command) {
            case "check":
                await runCheck();
                break;

            case "backup":
                await runBackup();
                break;

            case "delete":
                if (!options.confirm) {
                    log("❌ The delete command requires the --confirm flag", "red");
                    log("Usage: node scripts/production-data-manager.js delete --confirm", "yellow");
                    process.exit(1);
                }

                if (options.full) {
                    await runFullWorkflow(options);
                } else {
                    await runDelete(options);
                }
                break;

            case "full":
                if (!options.confirm) {
                    log("❌ The full command requires the --confirm flag", "red");
                    log("Usage: node scripts/production-data-manager.js full --confirm", "yellow");
                    process.exit(1);
                }
                await runFullWorkflow(options);
                break;

            case "help":
            case "--help":
            case "-h":
                showHelp();
                break;

            default:
                if (!command) {
                    showHelp();
                } else {
                    log(`❌ Unknown command: ${command}`, "red");
                    log("");
                    showHelp();
                    process.exit(1);
                }
                break;
        }
    } catch (error) {
        log(`❌ An error occurred: ${error.message}`, "red");
        process.exit(1);
    }
}

// Execute script
const isMainModule = process.argv[1] && new URL(process.argv[1], "file://").pathname === __filename;

if (isMainModule) {
    main().catch(error => {
        log(`❌ Unexpected error: ${error.message}`, "red");
        process.exit(1);
    });
}

export { main, runBackup, runCheck, runDelete };
