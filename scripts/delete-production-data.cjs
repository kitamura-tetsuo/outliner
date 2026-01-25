#!/usr/bin/env node

/**
 * Production Data Deletion Script
 *
 * Usage:
 * node scripts/delete-production-data.js --confirm
 *
 * Note: This script deletes ALL data in the production environment.
 * Be sure to create a backup before execution.
 */

const https = require("https");
const readline = require("readline");

// Settings
const PRODUCTION_URL = "https://us-central1-outliner-d57b0.cloudfunctions.net/deleteAllProductionData";
const ADMIN_TOKEN = "ADMIN_DELETE_ALL_DATA_2024";
const CONFIRMATION_CODE = "DELETE_ALL_PRODUCTION_DATA_CONFIRM";

// Parse command line arguments
const args = process.argv.slice(2);
const confirmFlag = args.includes("--confirm");
const forceFlag = args.includes("--force");

// Colored log output
const colors = {
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
};

function log(message, color = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Function to send HTTPS request
function makeRequest(data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options = {
            hostname: "us-central1-outliner-d57b0.cloudfunctions.net",
            path: "/deleteAllProductionData",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let responseData = "";

            res.on("data", (chunk) => {
                responseData += chunk;
            });

            res.on("end", () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve({ statusCode: res.statusCode, data: parsedData });
                } catch (error) {
                    resolve({ statusCode: res.statusCode, data: responseData });
                }
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Function to ask for user confirmation
function askConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
        });
    });
}

// Main process
async function main() {
    log("=".repeat(80), "red");
    log("Production Data Deletion Script", "red");
    log("=".repeat(80), "red");
    log("");

    log("⚠️  WARNING: This script will delete ALL data in the production environment!", "yellow");
    log("   - All Firebase Firestore collections", "yellow");
    log("   - All Firebase Auth users", "yellow");
    log("   - All Firebase Storage files", "yellow");
    log("");

    // Check confirmation flag
    if (!confirmFlag) {
        log("Error: --confirm flag is required", "red");
        log("Usage: node scripts/delete-production-data.js --confirm", "blue");
        process.exit(1);
    }

    // Additional confirmation if force flag is missing
    if (!forceFlag) {
        log("Are you sure you want to delete all data in the production environment?", "red");
        log("This operation cannot be undone.", "red");
        log("");

        const confirmed = await askConfirmation('Type "yes" to continue: ');

        if (!confirmed) {
            log("Operation cancelled.", "green");
            process.exit(0);
        }
    }

    log("");
    log("Starting production data deletion...", "yellow");
    log("");

    try {
        // API call
        const response = await makeRequest({
            adminToken: ADMIN_TOKEN,
            confirmationCode: CONFIRMATION_CODE,
        });

        if (response.statusCode === 200) {
            log("✅ Data deletion completed successfully", "green");
            log("");

            if (response.data && response.data.results) {
                const results = response.data.results;

                // Firestore results
                log("📊 Deletion Results:", "blue");
                log(
                    `Firestore: ${results.firestore.success ? "Success" : "Failed"}`,
                    results.firestore.success ? "green" : "red",
                );

                if (results.firestore.deletedCollections) {
                    results.firestore.deletedCollections.forEach(col => {
                        log(`  - ${col.name}: Deleted ${col.count} documents`, "blue");
                    });
                }

                if (results.firestore.error) {
                    log(`  Error: ${results.firestore.error}`, "red");
                }

                // Firebase Auth results
                log(
                    `Firebase Auth: ${results.auth.success ? "Success" : "Failed"}`,
                    results.auth.success ? "green" : "red",
                );
                log(`  - Deleted ${results.auth.deletedUsers} users`, "blue");

                if (results.auth.error) {
                    log(`  Error: ${results.auth.error}`, "red");
                }

                // Firebase Storage results
                log(
                    `Firebase Storage: ${results.storage.success ? "Success" : "Failed"}`,
                    results.storage.success ? "green" : "red",
                );
                log(`  - Deleted ${results.storage.deletedFiles} files`, "blue");

                if (results.storage.error) {
                    log(`  Error: ${results.storage.error}`, "red");
                }
            }

            log("");
            log(`Execution time: ${response.data.timestamp || new Date().toISOString()}`, "blue");
        } else {
            log(`❌ Data deletion failed (HTTP ${response.statusCode})`, "red");
            log(`Error: ${JSON.stringify(response.data, null, 2)}`, "red");
            process.exit(1);
        }
    } catch (error) {
        log(`❌ Request error: ${error.message}`, "red");
        process.exit(1);
    }
}

// Execute script
if (require.main === module) {
    main().catch(error => {
        log(`❌ Unexpected error: ${error.message}`, "red");
        process.exit(1);
    });
}

module.exports = { makeRequest, ADMIN_TOKEN, CONFIRMATION_CODE };
