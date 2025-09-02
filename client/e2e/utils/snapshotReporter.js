// ESM custom reporter to run snapshot comparisons after each test ends
import fs from "fs";
import path from "path";
import { compareTestCaseSnapshots } from "./snapshotComparison.js";

export default class SnapshotReporter {
    onEnd(result) {
        // Playwright Reporter APIのonEndで、差分が1件でもあればrun全体をfailにする
        if (this._hadDifferences) {
            console.log("❌ [SnapshotReporter] Differences detected across test run. Failing run.");
            if (result) result.status = "failed";
            // process.exitCodeを明示的に設定（安全側）
            process.exitCode = 1;
        }
    }
    constructor() {
        this._snapshotsDir = path.resolve(process.cwd(), "e2e-snapshots");
        this._compared = new Set(); // process-scoped only; do not persist across runs
        this._startTime = Date.now();
        this._lastPairMtimeMs = 0;
        this._lastComparedMtime = new Map(); // key: tc, value: last compared pairMtime
        this._hadDifferences = false; // 差分検出フラグ（レポート終了時にrun全体をfailにできる）
    }

    onTestEnd(test, result) {
        const proj = (test && test.parent && test.parent.project && test.parent.project().name)
            || (test && test.project && test.project.name) || "unknown";
        const title = (test && test.title) || "unknown";
        const slug = this._slugify(title);
        console.log(`🔧 [SnapshotReporter] onTestEnd: project=${proj}, title=${title}`);

        const isSingleSpec = process.env.PLAYWRIGHT_SINGLE_SPEC_RUN === "true";
        // 1) タイトル由来のラベルを優先的に比較
        // 単体実行でも比較は実行する。ペア不在時はフォールバックせずログのみ。
        const comparedByTitle = this._scanAndCompare(slug, { forceIfNone: false, setHadDifferences: true });
        if (isSingleSpec) {
            // 単一スペック実行時は、他ケースのペア比較は行わない（他ケース差分で失敗させない）
            return;
        }
        // 2) 通常実行では、何も比較できなければ全体スキャン
        if (!comparedByTitle) this._scanAndCompare(undefined, { forceIfNone: true, setHadDifferences: true });
    }

    _slugify(s) {
        return String(s).trim().replace(/\s+/g, "-");
    }

    _scanAndCompare(filterSlug, opts = { forceIfNone: true, setHadDifferences: true }) {
        const { forceIfNone, setHadDifferences } = opts;
        try {
            if (!fs.existsSync(this._snapshotsDir)) {
                console.log(`🔧 [SnapshotReporter] snapshots dir not found: ${this._snapshotsDir}`);
                return false;
            }
            const files = fs.readdirSync(this._snapshotsDir);
            // build candidate pairs
            const testCases = new Set();
            for (const file of files) {
                if (file.endsWith("-fluid.json")) {
                    const tc = file.replace("-fluid.json", "");
                    if (files.includes(`${tc}-yjs.json`)) testCases.add(tc);
                }
            }

            // filter by test title slug if provided
            const casesArray = Array.from(testCases);
            const filtered = filterSlug
                ? casesArray.filter(tc => tc.includes(filterSlug))
                : casesArray;

            console.log(
                `🔧 [SnapshotReporter] candidates=${filtered.length}${
                    filterSlug ? ` (filtered by: ${filterSlug})` : ""
                }`,
            );

            let compared = 0, matched = 0, differed = 0;
            let didCompareAny = false;
            for (const tc of filtered) {
                if (this._compared.has(tc)) continue;
                try {
                    console.log(`🔍 [SnapshotReporter] Comparing: ${tc}`);
                    const result = compareTestCaseSnapshots(tc, this._snapshotsDir);
                    compared++;
                    didCompareAny = true;
                    if (result.isMatch) {
                        matched++;
                        console.log(`✅ [SnapshotReporter] ${tc}: Snapshots match`);
                    } else {
                        differed++;
                        if (setHadDifferences) this._hadDifferences = true;
                        console.log(`❌ [SnapshotReporter] ${tc}: Snapshots differ:`);
                        for (const diff of result.differences) console.log(`   - ${diff}`);
                    }
                    this._compared.add(tc);
                } catch (e) {
                    console.log(`⚠️  [SnapshotReporter] ${tc}: comparison error: ${e.message}`);
                }
            }

            if (compared > 0) {
                console.log(
                    `📊 [SnapshotReporter] Summary: compared=${compared}, matched=${matched}, differed=${differed}`,
                );
            } else if (forceIfNone) {
                // フォールバック: 少なくとも1件は強制的に比較してログを出す（可視性向上）
                const pickLatest = (arr) => {
                    let best = null, bestTime = -1;
                    for (const tc of arr) {
                        try {
                            const f = path.join(this._snapshotsDir, `${tc}-fluid.json`);
                            const y = path.join(this._snapshotsDir, `${tc}-yjs.json`);
                            const t = Math.max(fs.statSync(f).mtimeMs, fs.statSync(y).mtimeMs);
                            if (t > bestTime) {
                                best = tc;
                                bestTime = t;
                            }
                        } catch {}
                    }
                    return best;
                };
                const forced = pickLatest(filtered);
                if (forced) {
                    try {
                        console.log(`📌 [SnapshotReporter] Forcing comparison for visibility: ${forced}`);
                        const result = compareTestCaseSnapshots(forced, this._snapshotsDir);
                        didCompareAny = true;
                        if (result.isMatch) {
                            console.log(`✅ [SnapshotReporter] ${forced}: Snapshots match`);
                        } else {
                            if (setHadDifferences) this._hadDifferences = true;
                            console.log(`❌ [SnapshotReporter] ${forced}: Snapshots differ:`);
                            for (const diff of result.differences) console.log(`   - ${diff}`);
                        }
                        this._compared.add(forced);
                    } catch (e) {
                        console.log(`⚠️  [SnapshotReporter] ${forced}: comparison error: ${e.message}`);
                    }
                } else {
                    console.log(`📊 [SnapshotReporter] No pairs to compare at this time`);
                }
            }

            return didCompareAny;
        } catch (e) {
            console.log(`[SnapshotReporter] scan error: ${e.message}`);
            return false;
        }
    }

    _loadCache() {
        try {
            if (fs.existsSync(this._cachePath)) {
                const data = JSON.parse(fs.readFileSync(this._cachePath, "utf-8"));
                if (Array.isArray(data)) data.forEach(k => this._compared.add(k));
            }
        } catch {}
    }

    _saveCache() {
        try {
            if (!fs.existsSync(this._snapshotsDir)) fs.mkdirSync(this._snapshotsDir, { recursive: true });
            fs.writeFileSync(this._cachePath, JSON.stringify(Array.from(this._compared), null, 2));
        } catch {}
    }
}
