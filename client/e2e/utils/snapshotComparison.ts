/**
 * スナップショット比較ユーティリティ
 * FluidモードとYjsモードのスナップショットを比較し、データの整合性を確認する
 */

import fs from "fs";
import path from "path";

export interface SnapshotItem {
    text: string;
    id?: string;
    createdAt?: string;
}

export interface SnapshotPage {
    title: string;
    items: SnapshotItem[];
    id?: string;
    createdAt?: string;
}

export interface Snapshot {
    projectTitle: string;
    pages: SnapshotPage[];
    projectId?: string;
    createdAt?: string;
}

export interface ComparisonResult {
    isMatch: boolean;
    differences: string[];
    fluidSnapshot: Snapshot;
    yjsSnapshot: Snapshot;
}

/**
 * スナップショットからメタデータ（ID、作成時刻）を除去して正規化する
 */
function normalizeSnapshot(snapshot: Snapshot): Snapshot {
    return {
        projectTitle: snapshot.projectTitle,
        pages: snapshot.pages.map(page => ({
            title: page.title,
            items: page.items.map(item => ({
                text: item.text,
            })),
        })),
    };
}

/**
 * 2つのスナップショットを比較する
 */
export function compareSnapshots(fluidSnapshot: Snapshot, yjsSnapshot: Snapshot): ComparisonResult {
    const differences: string[] = [];

    // 正規化されたスナップショットを作成
    const normalizedFluid = normalizeSnapshot(fluidSnapshot);
    const normalizedYjs = normalizeSnapshot(yjsSnapshot);

    // プロジェクトタイトルの比較（末尾の数字列はすべて除去: 例 "Test Project 0 123456" -> "Test Project"）
    const stripTrailingNumbers = (s: string) => s.replace(/(\s+\d+)+$/, "");
    const fluidTitleBase = stripTrailingNumbers(normalizedFluid.projectTitle);
    const yjsTitleBase = stripTrailingNumbers(normalizedYjs.projectTitle);

    if (fluidTitleBase !== yjsTitleBase) {
        differences.push(`Project title base mismatch: "${fluidTitleBase}" vs "${yjsTitleBase}"`);
    }

    // ページ数の比較
    if (normalizedFluid.pages.length !== normalizedYjs.pages.length) {
        differences.push(`Page count mismatch: ${normalizedFluid.pages.length} vs ${normalizedYjs.pages.length}`);
        return {
            isMatch: false,
            differences,
            fluidSnapshot,
            yjsSnapshot,
        };
    }

    // 各ページの比較
    for (let i = 0; i < normalizedFluid.pages.length; i++) {
        const fluidPage = normalizedFluid.pages[i];
        const yjsPage = normalizedYjs.pages[i];

        // ページタイトルの比較（タイムスタンプ部分を除く）
        const fluidPageTitleBase = fluidPage.title.replace(/-\d+$/, "");
        const yjsPageTitleBase = yjsPage.title.replace(/-\d+$/, "");

        if (fluidPageTitleBase !== yjsPageTitleBase) {
            differences.push(`Page ${i} title base mismatch: "${fluidPageTitleBase}" vs "${yjsPageTitleBase}"`);
        }

        // アイテムのテキスト内容を抽出（タイトルアイテムのみ除く、空のアイテムは含める）
        const fluidTexts = fluidPage.items
            .map(item => item.text.trim())
            .filter(text => !text.startsWith("test-page-"));
        const yjsTexts = yjsPage.items
            .map(item => item.text.trim())
            .filter(text => !text.startsWith("test-page-"));

        // アイテム数の比較
        if (fluidTexts.length !== yjsTexts.length) {
            differences.push(`Page ${i} item count mismatch: ${fluidTexts.length} vs ${yjsTexts.length}`);
        }

        // 各テキストの順序を保持して厳密に比較（空のアイテムも含む）
        for (let j = 0; j < Math.max(fluidTexts.length, yjsTexts.length); j++) {
            const fluidText = fluidTexts[j] || "";
            const yjsText = yjsTexts[j] || "";

            if (fluidText !== yjsText) {
                differences.push(`Page ${i} item ${j} text mismatch: "${fluidText}" vs "${yjsText}"`);
            }
        }
    }

    return {
        isMatch: differences.length === 0,
        differences,
        fluidSnapshot,
        yjsSnapshot,
    };
}

/**
 * スナップショットファイルを読み込む
 */
export function loadSnapshot(filePath: string): Snapshot {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Snapshot file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Snapshot;
}

/**
 * 指定されたテストケースのFluidとYjsスナップショットを比較する
 */
export function compareTestCaseSnapshots(testCaseName: string, snapshotsDir?: string): ComparisonResult;
export function compareTestCaseSnapshots(
    fluidPath: string,
    yjsPath: string,
): { success: boolean; differences?: string[]; };
export function compareTestCaseSnapshots(
    arg1: string,
    arg2?: string,
): ComparisonResult | { success: boolean; differences?: string[]; } {
    if (arg2 && !arg2.includes("/") && !arg2.includes("\\")) {
        // 旧形式: testCaseName, snapshotsDir
        const testCaseName = arg1;
        const snapshotsDir = arg2 || "e2e-snapshots";
        const fluidPath = path.join(snapshotsDir, `${testCaseName}-fluid.json`);
        const yjsPath = path.join(snapshotsDir, `${testCaseName}-yjs.json`);

        const fluidSnapshot = loadSnapshot(fluidPath);
        const yjsSnapshot = loadSnapshot(yjsPath);

        return compareSnapshots(fluidSnapshot, yjsSnapshot);
    } else {
        // 新形式: fluidPath, yjsPath
        const fluidPath = arg1;
        const yjsPath = arg2!;

        try {
            const fluidSnapshot = loadSnapshot(fluidPath);
            const yjsSnapshot = loadSnapshot(yjsPath);

            const result = compareSnapshots(fluidSnapshot, yjsSnapshot);

            return {
                success: result.isMatch,
                differences: result.differences,
            };
        } catch (error) {
            return {
                success: false,
                differences: [`Error loading snapshots: ${error.message}`],
            };
        }
    }
}

/**
 * 比較結果を表示する
 */
export function printComparisonResult(result: ComparisonResult, testCaseName?: string): void {
    const prefix = testCaseName ? `[${testCaseName}] ` : "";

    if (result.isMatch) {
        console.log(`${prefix}✅ Snapshots match perfectly!`);
    } else {
        console.log(`${prefix}❌ Snapshots do not match:`);
        result.differences.forEach((diff, index) => {
            console.log(`  ${index + 1}. ${diff}`);
        });
    }
}
