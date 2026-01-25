#!/usr/bin/env node
/**
 * Polling Analysis Tool
 *
 * This script performs the following:
 * 1. Detects all polling processes in the codebase
 * 2. Catalogs the purpose and location of each polling
 * 3. Measures the impact of polling during test execution
 * 4. Generates a report identifying unnecessary polling
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PollingInstance {
    file: string;
    line: number;
    type: "setInterval" | "setTimeout" | "requestAnimationFrame";
    code: string;
    context: string[];
    id: string;
}

interface PollingReport {
    totalPolling: number;
    instances: PollingInstance[];
    categorized: {
        necessary: PollingInstance[];
        suspicious: PollingInstance[];
        testOnly: PollingInstance[];
    };
}

/**
 * Detect polling processes in a file
 */
function detectPollingInFile(filePath: string): PollingInstance[] {
    const instances: PollingInstance[] = [];
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const pollingPatterns = [
        { type: "setInterval" as const, pattern: /setInterval\s*\(/g },
        { type: "setTimeout" as const, pattern: /setTimeout\s*\(/g },
        { type: "requestAnimationFrame" as const, pattern: /requestAnimationFrame\s*\(/g },
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const { type, pattern } of pollingPatterns) {
            if (pattern.test(line)) {
                // Get context (5 lines before and after)
                const contextStart = Math.max(0, i - 5);
                const contextEnd = Math.min(lines.length, i + 6);
                const context = lines.slice(contextStart, contextEnd);

                // Generate unique ID
                const id = `${path.basename(filePath)}:${i + 1}:${type}`;

                instances.push({
                    file: filePath,
                    line: i + 1,
                    type,
                    code: line.trim(),
                    context,
                    id,
                });
            }
        }
    }

    return instances;
}

/**
 * Recursively scan directory to detect polling
 */
function scanDirectory(dir: string, extensions: string[] = [".ts", ".svelte", ".js"]): PollingInstance[] {
    let instances: PollingInstance[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Exclude node_modules, .svelte-kit, build, etc.
        if (entry.isDirectory()) {
            if (!["node_modules", ".svelte-kit", "build", "dist", ".git"].includes(entry.name)) {
                instances = instances.concat(scanDirectory(fullPath, extensions));
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
                instances = instances.concat(detectPollingInFile(fullPath));
            }
        }
    }

    return instances;
}

/**
 * Categorize polling
 */
function categorizePolling(instances: PollingInstance[]): PollingReport["categorized"] {
    const necessary: PollingInstance[] = [];
    const suspicious: PollingInstance[] = [];
    const testOnly: PollingInstance[] = [];

    for (const instance of instances) {
        const contextStr = instance.context.join("\n").toLowerCase();
        const codeStr = instance.code.toLowerCase();

        // Test-only polling
        if (
            contextStr.includes("e2e")
            || contextStr.includes("test")
            || contextStr.includes("__e2e__")
            || contextStr.includes("vite_is_test")
        ) {
            testOnly.push(instance);
            continue;
        }

        // Clearly necessary polling (log rotation, cursor blink, etc.)
        if (
            contextStr.includes("log rotation")
            || contextStr.includes("cursor blink")
            || contextStr.includes("idle timeout")
            || codeStr.includes("530") // Cursor blink interval
        ) {
            necessary.push(instance);
            continue;
        }

        // Suspicious polling (short interval, no clear purpose)
        if (
            codeStr.includes("100") // 100ms interval
            || codeStr.includes("120") // 120ms interval
            || contextStr.includes("fallback")
            || contextStr.includes("フォールバック")
            || contextStr.includes("暫定")
        ) {
            suspicious.push(instance);
            continue;
        }

        // Treat others as suspicious
        suspicious.push(instance);
    }

    return { necessary, suspicious, testOnly };
}

/**
 * Generate report
 */
function generateReport(instances: PollingInstance[]): PollingReport {
    const categorized = categorizePolling(instances);

    return {
        totalPolling: instances.length,
        instances,
        categorized,
    };
}

/**
 * Output report in Markdown format
 */
function formatReportAsMarkdown(report: PollingReport): string {
    let md = "# Polling Analysis Report\n\n";
    md += `Generated at: ${new Date().toISOString()}\n\n`;
    md += `## Overview\n\n`;
    md += `- Total Polling Count: ${report.totalPolling}\n`;
    md += `- Necessary Polling: ${report.categorized.necessary.length}\n`;
    md += `- Suspicious Polling: ${report.categorized.suspicious.length}\n`;
    md += `- Test-Only Polling: ${report.categorized.testOnly.length}\n\n`;

    // Suspicious polling details
    md += `## Suspicious Polling (Removal Candidates)\n\n`;
    md += `These pollings may be safe to remove.\n\n`;

    for (const instance of report.categorized.suspicious) {
        md += `### ${instance.id}\n\n`;
        md += `- **File**: \`${instance.file}\`\n`;
        md += `- **Line**: ${instance.line}\n`;
        md += `- **Type**: ${instance.type}\n`;
        md += `- **Code**: \`${instance.code}\`\n\n`;
        md += `**Context**:\n\`\`\`\n${instance.context.join("\n")}\n\`\`\`\n\n`;
    }

    // Test-only polling
    md += `## Test-Only Polling\n\n`;
    md += `These are pollings executed only in test environments.\n\n`;

    for (const instance of report.categorized.testOnly) {
        md += `### ${instance.id}\n\n`;
        md += `- **File**: \`${instance.file}\`\n`;
        md += `- **Line**: ${instance.line}\n`;
        md += `- **Type**: ${instance.type}\n\n`;
    }

    // Necessary polling
    md += `## Necessary Polling\n\n`;
    md += `These are pollings with clear purposes and should not be removed.\n\n`;

    for (const instance of report.categorized.necessary) {
        md += `### ${instance.id}\n\n`;
        md += `- **File**: \`${instance.file}\`\n`;
        md += `- **Line**: ${instance.line}\n`;
        md += `- **Type**: ${instance.type}\n`;
        md += `- **Code**: \`${instance.code}\`\n\n`;
    }

    return md;
}

/**
 * Main process
 */
function main() {
    console.log("Starting polling analysis...\n");

    const clientDir = path.join(process.cwd(), "client", "src");

    console.log(`Scan target: ${clientDir}`);
    const instances = scanDirectory(clientDir);

    console.log(`\nDetected polling: ${instances.length} instances\n`);

    const report = generateReport(instances);
    const markdown = formatReportAsMarkdown(report);

    // Save report
    const reportPath = path.join(process.cwd(), "docs", "polling-analysis-report.md");
    fs.writeFileSync(reportPath, markdown, "utf-8");

    console.log(`Report saved: ${reportPath}\n`);

    // Display summary
    console.log("=== Summary ===");
    console.log(`Total Polling Count: ${report.totalPolling}`);
    console.log(`Necessary Polling: ${report.categorized.necessary.length}`);
    console.log(`Suspicious Polling: ${report.categorized.suspicious.length}`);
    console.log(`Test-Only Polling: ${report.categorized.testOnly.length}`);
    console.log("\nSuspicious Polling Removal Candidates:");

    for (const instance of report.categorized.suspicious.slice(0, 5)) {
        console.log(`  - ${instance.file}:${instance.line} (${instance.type})`);
    }

    if (report.categorized.suspicious.length > 5) {
        console.log(`  ... and ${report.categorized.suspicious.length - 5} more`);
    }
}

main();
