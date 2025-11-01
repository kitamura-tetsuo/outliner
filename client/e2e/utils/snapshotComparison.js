/**
 * Snapshot comparison utilities (legacy vs Yjs)
 * Compares minimal project/page/item text structure saved to e2e-snapshots.
 */

import fs from "fs";
import path from "path";

/**
 * Normalize a snapshot by stripping IDs/timestamps and only keeping texts
 */
function normalizeSnapshot(snapshot) {
    return {
        projectTitle: snapshot.projectTitle ?? "",
        pages: (snapshot.pages ?? []).map((page) => ({
            title: page.title ?? "",
            items: (page.items ?? []).map((it) => ({ text: (it?.text ?? "").toString() })),
        })),
    };
}

/**
 * Compare two snapshots (already parsed objects)
 */
export function compareSnapshots(fluidSnapshot, yjsSnapshot) {
    const differences = [];

    const normalizedFluid = normalizeSnapshot(fluidSnapshot);
    const normalizedYjs = normalizeSnapshot(yjsSnapshot);

    // Compare project title (ignore trailing numbers segments)
    const stripTrailingNumbers = (s) => (s ?? "").replace(/(\s+\d+)+$/, "");
    const fluidTitleBase = stripTrailingNumbers(normalizedFluid.projectTitle);
    const yjsTitleBase = stripTrailingNumbers(normalizedYjs.projectTitle);
    if (fluidTitleBase !== yjsTitleBase) {
        differences.push(`Project title base mismatch: "${fluidTitleBase}" vs "${yjsTitleBase}"`);
    }

    // Page count
    if ((normalizedFluid.pages ?? []).length !== (normalizedYjs.pages ?? []).length) {
        differences.push(
            `Page count mismatch: ${normalizedFluid.pages.length} vs ${normalizedYjs.pages.length}`,
        );
        return { isMatch: false, differences, fluidSnapshot, yjsSnapshot };
    }

    // Per-page
    for (let i = 0; i < normalizedFluid.pages.length; i++) {
        const fPage = normalizedFluid.pages[i];
        const yPage = normalizedYjs.pages[i];

        const fTitleBase = (fPage.title ?? "").replace(/-\d+$/, "");
        const yTitleBase = (yPage.title ?? "").replace(/-\d+$/, "");
        if (fTitleBase !== yTitleBase) {
            differences.push(`Page ${i} title base mismatch: "${fTitleBase}" vs "${yTitleBase}"`);
        }

        // Extract texts excluding synthetic page-title prefixes if any
        const fTexts = (fPage.items ?? [])
            .map((it) => (it?.text ?? "").toString().trim())
            .filter((t) => !t.startsWith("test-page-"));
        const yTexts = (yPage.items ?? [])
            .map((it) => (it?.text ?? "").toString().trim())
            .filter((t) => !t.startsWith("test-page-"));

        if (fTexts.length !== yTexts.length) {
            differences.push(`Page ${i} item count mismatch: ${fTexts.length} vs ${yTexts.length}`);
        }

        const maxLen = Math.max(fTexts.length, yTexts.length);
        for (let j = 0; j < maxLen; j++) {
            const ft = fTexts[j] ?? "";
            const yt = yTexts[j] ?? "";
            if (ft !== yt) {
                differences.push(`Page ${i} item ${j} text mismatch: "${ft}" vs "${yt}"`);
            }
        }
    }

    return { isMatch: differences.length === 0, differences, fluidSnapshot, yjsSnapshot };
}

/** Load snapshot JSON file */
export function loadSnapshot(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Snapshot file not found: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
}

/**
 * Compare a single test case by file paths
 */
export function compareTestCaseSnapshots(fluidPath, yjsPath) {
    try {
        const f = loadSnapshot(fluidPath);
        const y = loadSnapshot(yjsPath);
        const result = compareSnapshots(f, y);
        return { success: result.isMatch, differences: result.differences };
    } catch (e) {
        return { success: false, differences: [String(e?.message ?? e)] };
    }
}

export function printComparisonResult(result) {
    if (result.isMatch || result.success) {
        console.log(`✅ Snapshots match perfectly!`);
    } else {
        const diffs = result.differences ?? [];
        console.log(`❌ Snapshots do not match:`);
        diffs.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
    }
}
