#!/usr/bin/env node
/**
 * ポーリング分析ツール
 *
 * このスクリプトは以下を実行します:
 * 1. コードベース内のすべてのポーリング処理を検出
 * 2. 各ポーリングの目的と場所をカタログ化
 * 3. テスト実行時にポーリングの影響を測定
 * 4. 不要なポーリングを特定するレポートを生成
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
 * ファイル内のポーリング処理を検出
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
                // コンテキストを取得（前後5行）
                const contextStart = Math.max(0, i - 5);
                const contextEnd = Math.min(lines.length, i + 6);
                const context = lines.slice(contextStart, contextEnd);

                // ユニークIDを生成
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
 * ディレクトリを再帰的に走査してポーリングを検出
 */
function scanDirectory(dir: string, extensions: string[] = [".ts", ".svelte", ".js"]): PollingInstance[] {
    let instances: PollingInstance[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // node_modules, .svelte-kit, build などは除外
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
 * ポーリングを分類
 */
function categorizePolling(instances: PollingInstance[]): PollingReport["categorized"] {
    const necessary: PollingInstance[] = [];
    const suspicious: PollingInstance[] = [];
    const testOnly: PollingInstance[] = [];

    for (const instance of instances) {
        const contextStr = instance.context.join("\n").toLowerCase();
        const codeStr = instance.code.toLowerCase();

        // テスト専用のポーリング
        if (
            contextStr.includes("e2e")
            || contextStr.includes("test")
            || contextStr.includes("__e2e__")
            || contextStr.includes("vite_is_test")
        ) {
            testOnly.push(instance);
            continue;
        }

        // 明らかに必要なポーリング（ログローテーション、カーソル点滅など）
        if (
            contextStr.includes("log rotation")
            || contextStr.includes("cursor blink")
            || contextStr.includes("idle timeout")
            || codeStr.includes("530") // カーソル点滅の間隔
        ) {
            necessary.push(instance);
            continue;
        }

        // 疑わしいポーリング（短い間隔、明確な目的がない）
        if (
            codeStr.includes("100") // 100ms間隔
            || codeStr.includes("120") // 120ms間隔
            || contextStr.includes("fallback")
            || contextStr.includes("フォールバック")
            || contextStr.includes("暫定")
        ) {
            suspicious.push(instance);
            continue;
        }

        // その他は疑わしいものとして扱う
        suspicious.push(instance);
    }

    return { necessary, suspicious, testOnly };
}

/**
 * レポートを生成
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
 * レポートをMarkdown形式で出力
 */
function formatReportAsMarkdown(report: PollingReport): string {
    let md = "# ポーリング分析レポート\n\n";
    md += `生成日時: ${new Date().toISOString()}\n\n`;
    md += `## 概要\n\n`;
    md += `- 総ポーリング数: ${report.totalPolling}\n`;
    md += `- 必要なポーリング: ${report.categorized.necessary.length}\n`;
    md += `- 疑わしいポーリング: ${report.categorized.suspicious.length}\n`;
    md += `- テスト専用ポーリング: ${report.categorized.testOnly.length}\n\n`;

    // 疑わしいポーリングの詳細
    md += `## 疑わしいポーリング（削除候補）\n\n`;
    md += `これらのポーリングは削除しても問題ない可能性があります。\n\n`;

    for (const instance of report.categorized.suspicious) {
        md += `### ${instance.id}\n\n`;
        md += `- **ファイル**: \`${instance.file}\`\n`;
        md += `- **行**: ${instance.line}\n`;
        md += `- **タイプ**: ${instance.type}\n`;
        md += `- **コード**: \`${instance.code}\`\n\n`;
        md += `**コンテキスト**:\n\`\`\`\n${instance.context.join("\n")}\n\`\`\`\n\n`;
    }

    // テスト専用ポーリング
    md += `## テスト専用ポーリング\n\n`;
    md += `これらはテスト環境でのみ実行されるポーリングです。\n\n`;

    for (const instance of report.categorized.testOnly) {
        md += `### ${instance.id}\n\n`;
        md += `- **ファイル**: \`${instance.file}\`\n`;
        md += `- **行**: ${instance.line}\n`;
        md += `- **タイプ**: ${instance.type}\n\n`;
    }

    // 必要なポーリング
    md += `## 必要なポーリング\n\n`;
    md += `これらは明確な目的があり、削除すべきではないポーリングです。\n\n`;

    for (const instance of report.categorized.necessary) {
        md += `### ${instance.id}\n\n`;
        md += `- **ファイル**: \`${instance.file}\`\n`;
        md += `- **行**: ${instance.line}\n`;
        md += `- **タイプ**: ${instance.type}\n`;
        md += `- **コード**: \`${instance.code}\`\n\n`;
    }

    return md;
}

/**
 * メイン処理
 */
function main() {
    console.log("ポーリング分析を開始します...\n");

    const clientDir = path.join(process.cwd(), "client", "src");

    console.log(`スキャン対象: ${clientDir}`);
    const instances = scanDirectory(clientDir);

    console.log(`\n検出されたポーリング: ${instances.length}件\n`);

    const report = generateReport(instances);
    const markdown = formatReportAsMarkdown(report);

    // レポートを保存
    const reportPath = path.join(process.cwd(), "docs", "polling-analysis-report.md");
    fs.writeFileSync(reportPath, markdown, "utf-8");

    console.log(`レポートを保存しました: ${reportPath}\n`);

    // サマリーを表示
    console.log("=== サマリー ===");
    console.log(`総ポーリング数: ${report.totalPolling}`);
    console.log(`必要なポーリング: ${report.categorized.necessary.length}`);
    console.log(`疑わしいポーリング: ${report.categorized.suspicious.length}`);
    console.log(`テスト専用ポーリング: ${report.categorized.testOnly.length}`);
    console.log("\n疑わしいポーリングの削除候補:");

    for (const instance of report.categorized.suspicious.slice(0, 5)) {
        console.log(`  - ${instance.file}:${instance.line} (${instance.type})`);
    }

    if (report.categorized.suspicious.length > 5) {
        console.log(`  ... 他 ${report.categorized.suspicious.length - 5} 件`);
    }
}

main();
