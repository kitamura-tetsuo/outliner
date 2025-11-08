#!/usr/bin/env node

/**
 * ESLint Detection Script - Identifies files ready for rule promotion from warn to error
 * Usage: node scripts/detect-promote-candidates.js --rules "no-console,no-unused-vars" --max-files 10
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command-line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        rules: [],
        maxFiles: 50,
        dryRun: false,
    };

    // Check for help flag
    if (args.includes("--help") || args.includes("-h")) {
        console.log(`
ESLint Detection Script - Identifies files ready for rule promotion from warn to error

Usage:
  node scripts/detect-promote-candidates.js --rules "rule1,rule2" [--max-files N] [--dry-run]

Parameters:
  --rules <rule1,rule2>    Comma-separated list of ESLint rules to check (required)
  --max-files <N>          Maximum number of candidate files to return (default: 50)
  --dry-run                Show what would be done without making changes (optional)

Examples:
  node scripts/detect-promote-candidates.js --rules "no-console,no-unused-vars"
  node scripts/detect-promote-candidates.js --rules "@typescript-eslint/no-explicit-any" --max-files 10
  node scripts/detect-promote-candidates.js --rules "no-unused-vars" --dry-run

Output:
  - Results are displayed on stdout
  - Full results are saved to scripts/promote-candidates-<timestamp>.json

Description:
  This script scans the codebase to identify files that have zero violations for
  specified ESLint rules. These files are candidates for promoting those rules
  from "warn" to "error" level in your ESLint configuration.
`);
        process.exit(0);
    }

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--rules") {
            result.rules = args[++i].split(",");
        } else if (args[i] === "--max-files") {
            result.maxFiles = parseInt(args[++i], 10);
        } else if (args[i] === "--dry-run") {
            result.dryRun = true;
        }
    }

    if (result.rules.length === 0) {
        console.error("Error: --rules parameter is required\n");
        console.error("Use --help for usage information");
        process.exit(1);
    }

    return result;
}

// Get list of files to scan
function getFilesToScan() {
    const files = [];
    const baseDir = path.join(__dirname, "..");

    // Define patterns for different directories
    const patterns = [
        { dir: "client/src", ext: ["js", "ts", "svelte"] },
        { dir: "client/e2e", ext: ["js", "ts", "svelte"] },
        { dir: "functions", ext: ["js", "ts"] },
        { dir: "server", ext: ["js", "ts"] },
        { dir: "scripts", ext: ["js", "ts"] },
    ];

    for (const { dir, ext } of patterns) {
        const dirPath = path.join(baseDir, dir);

        if (!fs.existsSync(dirPath)) {
            continue;
        }

        try {
            for (const extension of ext) {
                const result = execSync(
                    `find "${dirPath}" -type f -name "*.${extension}" 2>/dev/null | head -1000`,
                    {
                        encoding: "utf8",
                        stdio: ["pipe", "pipe", "pipe"],
                        cwd: baseDir,
                    },
                );

                const patternFiles = result.trim()
                    .split("\n")
                    .filter(f => f.length > 0)
                    .map(f => {
                        // Convert to relative path from baseDir
                        const relPath = path.relative(baseDir, f);
                        return relPath.replace(/\\/g, "/");
                    });

                files.push(...patternFiles);
            }
        } catch (e) {
            // Pattern didn't match any files, skip
        }
    }

    return [...new Set(files)]; // Remove duplicates
}

// Apply exclusions
function applyExclusions(files) {
    const exclusionPatterns = [
        "node_modules",
        "vendor",
        "dist",
        "build",
        ".git",
        "coverage",
        "tmp",
        ".svelte-kit",
        "generated",
        "tests/fixtures",
        "__tests__",
        ".spec.",
        ".test.",
    ];

    return files.filter(file => {
        const relativePath = file.replace(/^\.\//, "");
        const normalizedPath = relativePath.replace(/\\/g, "/"); // Normalize path separators

        // Check each exclusion pattern
        for (const pattern of exclusionPatterns) {
            if (normalizedPath.includes(pattern)) {
                return false;
            }
        }

        return true;
    });
}

// Run ESLint and get results
function runESLint(files, rules) {
    const results = new Map(); // filePath -> { violations: Map(rule -> count), cleanRules: Set }
    const baseDir = path.join(__dirname, "..");

    console.log(`Running ESLint on ${files.length} files...`);

    // Process files in batches to avoid command line length limits
    const batchSize = 20;
    const batches = [];

    for (let i = 0; i < files.length; i += batchSize) {
        batches.push(files.slice(i, i + batchSize));
    }

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchNum = i + 1;
        console.log(`Processing batch ${batchNum}/${batches.length}...`);

        try {
            // Build command with files as arguments
            const eslintCommand =
                `npx --yes --prefix client eslint --format=json --config client/eslint.config.js --ext .js,.ts,.svelte --max-warnings=0 ${
                    batch.join(" ")
                }`;

            const output = execSync(eslintCommand, {
                encoding: "utf8",
                cwd: baseDir,
                stdio: ["pipe", "pipe", "pipe"],
            });

            const eslintResults = JSON.parse(output);

            // Process ESLint results
            for (const fileResult of eslintResults) {
                const filePath = path.relative(baseDir, fileResult.filePath);
                const violations = new Map();
                const cleanRules = new Set(rules);

                for (const message of fileResult.messages) {
                    const ruleId = message.ruleId;

                    if (rules.includes(ruleId)) {
                        // Count this violation
                        const current = violations.get(ruleId) || 0;
                        violations.set(ruleId, current + 1);
                        cleanRules.delete(ruleId);
                    }
                }

                results.set(filePath, { violations, cleanRules });
            }
        } catch (e) {
            // ESLint might fail, but we can still parse partial results
            if (e.stdout) {
                try {
                    const eslintResults = JSON.parse(e.stdout);

                    for (const fileResult of eslintResults) {
                        const filePath = path.relative(baseDir, fileResult.filePath);
                        const violations = new Map();
                        const cleanRules = new Set(rules);

                        for (const message of fileResult.messages) {
                            const ruleId = message.ruleId;

                            if (rules.includes(ruleId)) {
                                const current = violations.get(ruleId) || 0;
                                violations.set(ruleId, current + 1);
                                cleanRules.delete(ruleId);
                            }
                        }

                        results.set(filePath, { violations, cleanRules });
                    }
                } catch (parseError) {
                    // Ignore parse errors
                }
            }
        }
    }

    console.log(`ESLint scan completed. ${results.size} files analyzed.`);
    return results;
}

// Calculate priority score for a file
function calculateScore(filePath, lastModified) {
    let score = 0;

    // Recent modification bonus (last 7 days)
    const daysSinceModified = (Date.now() - lastModified) / (1000 * 60 * 60 * 24);
    if (daysSinceModified <= 7) {
        score += 10;
    } else if (daysSinceModified <= 30) {
        score += 5;
    }

    // File type/location importance
    if (filePath.includes("/src/lib/")) {
        score += 20; // Core library code
    } else if (filePath.includes("/src/components/")) {
        score += 15; // Components
    } else if (filePath.includes("/src/")) {
        score += 10; // Other source files
    } else if (filePath.includes("e2e/")) {
        score += 5; // E2E tests
    }

    // Bonus for specific file types
    if (filePath.endsWith(".svelte") || filePath.endsWith(".svelte.ts")) {
        score += 5;
    } else if (filePath.endsWith(".ts")) {
        score += 3;
    }

    return score;
}

// Identify promotion candidates
function identifyCandidates(eslintResults, rules, maxFiles) {
    const candidates = [];
    const proposedChanges = {};

    // Initialize proposed changes for each rule
    for (const rule of rules) {
        proposedChanges[rule] = {
            files: [],
            severity: "error",
        };
    }

    for (const [filePath, data] of eslintResults.entries()) {
        try {
            // Get file stats for scoring
            const stats = fs.statSync(path.join(__dirname, "..", filePath));
            const lastModified = stats.mtime.getTime();

            for (const rule of data.cleanRules) {
                const score = calculateScore(filePath, lastModified);

                candidates.push({
                    file: filePath,
                    rule: rule,
                    currentStatus: "clean",
                    lastModified: new Date(lastModified).toISOString(),
                    score: score,
                });

                proposedChanges[rule].files.push(filePath);
            }
        } catch (e) {
            // File might not exist or be inaccessible, skip
        }
    }

    // Sort candidates by score (descending)
    candidates.sort((a, b) => b.score - a.score);

    // Apply max-files limit
    const limitedCandidates = candidates.slice(0, maxFiles);

    // Update proposed changes to match limited results
    for (const rule of Object.keys(proposedChanges)) {
        proposedChanges[rule].files = limitedCandidates
            .filter(c => c.rule === rule)
            .map(c => c.file)
            .slice(0, Math.ceil(maxFiles / rules.length)); // Distribute across rules
    }

    return { candidates: limitedCandidates, proposedChanges };
}

// Generate output
function generateOutput(args, candidates, proposedChanges) {
    const output = {
        timestamp: new Date().toISOString(),
        rules: args.rules,
        candidates: candidates,
        proposedChanges: proposedChanges,
    };

    // Output to stdout
    console.log("\n=== ESLint Promotion Candidates ===\n");
    console.log(JSON.stringify(output, null, 2));

    // Save to artifact file
    const artifactFile = path.join(__dirname, `promote-candidates-${Date.now()}.json`);
    fs.writeFileSync(artifactFile, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to: ${artifactFile}`);

    return artifactFile;
}

// Main execution
function main() {
    console.log("ESLint Detection Script - Starting...\n");

    const args = parseArgs();
    console.log(`Target rules: ${args.rules.join(", ")}`);
    console.log(`Max files: ${args.maxFiles}`);
    console.log(`Dry run: ${args.dryRun}\n`);

    // Step 1: Get files to scan
    const allFiles = getFilesToScan();
    const filesToScan = applyExclusions(allFiles);
    console.log(`Total files to scan: ${filesToScan.length}`);

    if (filesToScan.length === 0) {
        console.error("No files found to scan. Please check your project structure.");
        process.exit(1);
    }

    // Step 2: Run ESLint
    const eslintResults = runESLint(filesToScan, args.rules);

    // Step 3: Identify candidates
    const { candidates, proposedChanges } = identifyCandidates(eslintResults, args.rules, args.maxFiles);

    console.log(`\nFound ${candidates.length} promotion candidates across ${args.rules.length} rules.`);

    // Step 4: Generate output
    const artifactFile = generateOutput(args, candidates, proposedChanges);

    if (args.dryRun) {
        console.log("\n[DRY RUN MODE] No changes were made.");
    }

    console.log("\nDone!");
}

// Execute only when run directly (not when imported for tests)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}

// Export functions for testing
export { applyExclusions, calculateScore, generateOutput, getFilesToScan, identifyCandidates, parseArgs, runESLint };
