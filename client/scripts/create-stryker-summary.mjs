import { promises as fs } from "fs";
import path from "path";

const jsonPath = process.argv[2] ?? "reports/mutation/mutation-report.json";
const outputBase = process.argv[3] ?? "reports/mutation/mutation-report";

async function readJson(filePath) {
    try {
        const data = await fs.readFile(filePath, "utf8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            console.warn(`[stryker-summary] JSON report not found at ${filePath}`);
            return null;
        }
        throw error;
    }
}

function collectMutants(report) {
    const statuses = new Map();
    const survivors = [];

    function visitNode(node, filePath) {
        if (!node) {
            return;
        }
        if (node.mutants) {
            for (const mutant of node.mutants) {
                const status = mutant.status ?? "Unknown";
                statuses.set(status, (statuses.get(status) ?? 0) + 1);

                if (status === "Survived" || status === "NoCoverage") {
                    survivors.push({
                        filePath,
                        mutant,
                    });
                }
            }
        }
        if (node.files) {
            for (const [childPath, childNode] of Object.entries(node.files)) {
                const resolvedPath = filePath ? path.join(filePath, childPath) : childPath;
                visitNode(childNode, resolvedPath);
            }
        }
    }

    if (report.files) {
        for (const [filePath, node] of Object.entries(report.files)) {
            visitNode(node, filePath);
        }
    }

    const total = Array.from(statuses.values()).reduce((sum, count) => sum + count, 0);
    const ignored = statuses.get("Ignored") ?? 0;
    const considered = Math.max(0, total - ignored);
    const detectedStatuses = ["Killed", "Timeout", "RuntimeError", "CompileError", "MemoryError"]; // MemoryError may not exist but keep for completeness
    const detected = detectedStatuses.reduce((sum, status) => sum + (statuses.get(status) ?? 0), 0);
    const score = considered === 0 ? 100 : (detected / considered) * 100;

    return {
        statuses,
        survivors,
        total,
        ignored,
        considered,
        detected,
        score,
    };
}

function renderStatusTable(statusMap) {
    const entries = Array.from(statusMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
        return "(no mutants generated)";
    }

    const header = "| Status | Count |\n| --- | --- |";
    const rows = entries.map(([status, count]) => `| ${status} | ${count} |`);
    return [header, ...rows].join("\n");
}

function renderSurvivorList(survivors, limit = 5) {
    if (survivors.length === 0) {
        return "すべてのミューテーションが検出されました。";
    }

    const top = survivors.slice(0, limit);
    const lines = top.map(({ filePath, mutant }) => {
        const location = mutant.location;
        const start = location?.start;
        const lineInfo = start ? `:${start.line}:${start.column}` : "";
        const mutator = mutant.mutatorName ? ` (${mutant.mutatorName})` : "";
        return `- ${filePath}${lineInfo}${mutator}`;
    });

    if (survivors.length > limit) {
        lines.push(`- ...他 ${survivors.length - limit} 件`);
    }

    return lines.join("\n");
}

async function main() {
    const report = await readJson(jsonPath);
    if (!report) {
        return;
    }

    const summary = collectMutants(report);
    const mdLines = [
        "### Mutation Score",
        `- スコア: ${summary.score.toFixed(2)}%`,
        `- 総ミューテーション数: ${summary.total}`,
        `- 対象外 (Ignored): ${summary.ignored}`,
        "",
        "### ステータス別内訳",
        renderStatusTable(summary.statuses),
        "",
        "### 生存ミューテーション (上位)",
        renderSurvivorList(summary.survivors),
    ];

    const mdContent = mdLines.join("\n");
    const survivorText = renderSurvivorList(summary.survivors)
        .split("\n")
        .map(line => `  ${line}`)
        .join("\n");
    const txtContent = [
        `Mutation score: ${summary.score.toFixed(2)}%`,
        `Total mutants: ${summary.total}`,
        `Ignored mutants: ${summary.ignored}`,
        "",
        "Status counts:",
        ...Array.from(summary.statuses.entries()).map(([status, count]) => `- ${status}: ${count}`),
        "",
        "Top surviving mutants:",
        survivorText,
    ].join("\n");

    const mdPath = `${outputBase}.md`;
    const txtPath = `${outputBase}.txt`;

    await fs.mkdir(path.dirname(mdPath), { recursive: true });
    await fs.writeFile(mdPath, mdContent, "utf8");
    await fs.writeFile(txtPath, txtContent, "utf8");

    console.log(`[stryker-summary] Markdown summary written to ${mdPath}`);
    console.log(`[stryker-summary] Text summary written to ${txtPath}`);
}

main().catch((error) => {
    console.error("Failed to create Stryker summary", error);
    process.exitCode = 1;
});
