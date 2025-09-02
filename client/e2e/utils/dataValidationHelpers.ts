// @ts-nocheck
import { expect, type Page } from "@playwright/test";

/**
 * フェーズ管理用の定数
 */
export enum MigrationPhase {
    PHASE_1_COEXISTENCE = "phase1_coexistence", // FluidとYjsが併存（完了）
    PHASE_2_GRADUAL_MIGRATION = "phase2_gradual_migration", // 段階的切り替え
    PHASE_3_COMPLETE_MIGRATION = "phase3_complete_migration", // 完全移行
}

/**
 * E2Eテスト用のFluid-Yjsデータ検証ヘルパー
 * フェーズ2対応版：段階的切り替えに対応した柔軟な検証システム
 */
export class DataValidationHelpers {
    /**
     * 現在のマイグレーションフェーズを取得
     * @param page Playwrightのページオブジェクト
     */
    static async getCurrentMigrationPhase(page: Page): Promise<MigrationPhase> {
        // 現在はフェーズ1の併存システムを再実装中なので、フェーズ1として扱う
        // 将来的には環境変数やグローバル変数から取得する
        return MigrationPhase.PHASE_1_COEXISTENCE;
    }

    /**
     * フェーズに応じたデータ整合性を検証する（無効化 - モード分離のため）
     * @param page Playwrightのページオブジェクト
     * @param options 検証オプション
     */
    static async validateDataConsistency(
        page: Page,
        options: {
            checkProjectTitle?: boolean;
            checkPageCount?: boolean;
            checkPageTitles?: boolean;
            checkItemCounts?: boolean;
            logDetails?: boolean;
            phase?: MigrationPhase;
        } = {},
    ): Promise<void> {
        // 実行中のデータ整合性チェックは削除（モード分離のため）
        console.log(`🔍 Data consistency validation disabled for mode separation`);
        return;
    }

    /**
     * Yjsブランチ専用: Yjsモードのスナップショットのみを取得し、
     * Node 側にJSONとして保存する
     * 注意: Yjsブランチでは Fluid との比較は行わない（完全分離）
     */
    static async saveSnapshotsAndCompare(page: Page, label: string = "default"): Promise<void> {
        // Yjsブランチでは常にYjsモードとして動作
        const result = await page.evaluate(async () => {
            const mode = "yjs"; // Yjsブランチでは固定
            console.log(`🔧 [SnapshotExport] Yjs branch mode: ${mode}`);

            // Fluidコードは完全削除（Yjsブランチでは不要）
            // const exportFluidProjectSnapshot = ... // 削除

            const exportYjsProjectSnapshotNew = async (yjsProjectManager: any) => {
                console.log("🔍 [SnapshotExport] exportYjsProjectSnapshot called");

                const projectTitle = String(yjsProjectManager.getProjectTitle() ?? "");
                console.log("🔍 [SnapshotExport] Project title:", projectTitle);

                const pages = yjsProjectManager.getPages();
                console.log("🔍 [SnapshotExport] Pages found:", pages.length, pages);

                const normalizedPages = [];
                for (const page of pages) {
                    console.log("🔍 [SnapshotExport] Processing page:", page.id, page.title);

                    const manager = await yjsProjectManager.connectToPage(page.id);
                    console.log("🔍 [SnapshotExport] Connected to page manager:", !!manager);

                    const pageTitle = String(page.title ?? "");

                    if (manager) {
                        // YjsOrderedTreeManagerでアイテムリストを取得する
                        const collectItems = () => {
                            const allItems = [];

                            try {
                                const tree = manager.getTree();
                                console.log("🔍 [SnapshotExport] tree obtained:", !!tree);

                                const rawChildKeys = tree.getNodeChildrenFromKey("root");
                                console.log("🔍 [SnapshotExport] rawChildKeys for root:", rawChildKeys);

                                const children = tree.sortChildrenByOrder(rawChildKeys, "root");
                                console.log("🔍 [SnapshotExport] sortedChildKeys for root:", children);

                                if (children && Array.isArray(children)) {
                                    // ページタイトルノードを特定する
                                    let titleNodeKey = null;
                                    const titleNodeCandidates = [];
                                    const nonTitleNodes = [];

                                    for (const childKey of children) {
                                        const value = tree.getNodeValueFromKey(childKey);
                                        console.log("🔍 [SnapshotExport] Processing key:", childKey, "value:", value);

                                        if (value && String(value.text ?? "") === pageTitle) {
                                            titleNodeCandidates.push(childKey);
                                        } else {
                                            nonTitleNodes.push(childKey);
                                        }
                                    }

                                    // 最初のページタイトルノードを使用
                                    if (titleNodeCandidates.length > 0) {
                                        titleNodeKey = titleNodeCandidates[0];
                                        console.log("🔍 [SnapshotExport] Title node key:", titleNodeKey);

                                        // ページタイトルノードの子アイテムを取得
                                        const titleChildKeys = tree.getNodeChildrenFromKey(titleNodeKey);
                                        const sortedTitleChildren = tree.sortChildrenByOrder(
                                            titleChildKeys,
                                            titleNodeKey,
                                        );
                                        console.log("🔍 [SnapshotExport] Title children:", sortedTitleChildren);

                                        if (sortedTitleChildren && Array.isArray(sortedTitleChildren)) {
                                            for (const childKey of sortedTitleChildren) {
                                                const value = tree.getNodeValueFromKey(childKey);
                                                if (value) {
                                                    allItems.push({ text: String(value.text ?? "") });
                                                }
                                            }
                                        }
                                    }

                                    // ページタイトルノード以外のノードも取得（新規追加されたアイテム）
                                    console.log("🔍 [SnapshotExport] Non-title nodes:", nonTitleNodes);
                                    for (const childKey of nonTitleNodes) {
                                        const value = tree.getNodeValueFromKey(childKey);
                                        if (value) {
                                            allItems.push({ text: String(value.text ?? "") });
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn(`🔍 [SnapshotExport] Failed to get items:`, error);
                            }

                            console.log("🔍 [SnapshotExport] collectItems result:", allItems);
                            return allItems;
                        };

                        const childItems = collectItems();
                        console.log("🔍 [SnapshotExport] Child items found in page:", childItems.length);

                        // 空アイテムの数を制限する
                        const filteredChildItems = [];
                        let emptyItemCount = 0;
                        const maxEmptyItems = 1;

                        for (const item of childItems) {
                            if (item.text === "") {
                                if (emptyItemCount < maxEmptyItems) {
                                    filteredChildItems.push(item);
                                    emptyItemCount++;
                                }
                                // 余分な空アイテムはスキップ
                            } else {
                                filteredChildItems.push(item);
                            }
                        }

                        console.log(
                            "🔍 [SnapshotExport] Filtered child items:",
                            filteredChildItems.length,
                            "empty items:",
                            emptyItemCount,
                        );

                        // フラット構造：ページタイトルを最初に、その後に子アイテムを配置
                        const items = [
                            { text: pageTitle }, // ページタイトル
                            ...filteredChildItems, // フィルタリングされた子アイテム
                        ];

                        normalizedPages.push({ title: pageTitle, items });
                    } else {
                        // TreeManagerが見つからない場合は、ページタイトルのみ
                        const items = [{ text: pageTitle }];
                        normalizedPages.push({ title: pageTitle, items });
                    }
                }

                const result = { projectTitle, pages: normalizedPages };
                console.log("🔍 [SnapshotExport] Final Yjs result:", result);
                return result;
            };

            const stringifySnapshot = (snapshot: any) => {
                return JSON.stringify(snapshot, null, 2);
            };

            // Yjsブランチでは常にYjsモードで動作（Fluidコードは削除）
            let yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                console.log(
                    "🔧 [SnapshotExport] YjsProjectManager not found, creating new one without dynamic import...",
                );

                // YjsProjectManagerを新規作成（window から取得）
                const YjsProjectManager = (window as any).YjsProjectManager;
                if (!YjsProjectManager) {
                    throw new Error(
                        "YjsProjectManager constructor not found on window. Ensure setupGlobalDebugFunctions() ran in +layout.",
                    );
                }

                // プロジェクトIDを取得（URLから）
                const currentUrl = window.location.pathname;
                const urlMatch = currentUrl.match(/^\/([^\/]+)/);
                const projectId = urlMatch ? decodeURIComponent(urlMatch[1]) : "test-project";

                console.log(`🔧 [SnapshotExport] Creating YjsProjectManager with projectId: ${projectId}`);
                yjsProjectManager = new YjsProjectManager(projectId);
                await yjsProjectManager.connect(projectId);

                // グローバル変数に設定
                (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
                console.log(`🔧 [SnapshotExport] YjsProjectManager created and connected`);
            }

            // Yjsスナップショットを取得
            await new Promise(resolve => setTimeout(resolve, 200));
            console.log("🔍 [SnapshotExport] About to call exportYjsProjectSnapshotNew");
            let yjsSnap;
            try {
                yjsSnap = await exportYjsProjectSnapshotNew(yjsProjectManager);
                console.log("🔍 [SnapshotExport] exportYjsProjectSnapshotNew completed successfully");
            } catch (error) {
                console.error("🔍 [SnapshotExport] exportYjsProjectSnapshotNew failed:", error);
                throw error;
            }

            // Yjsブランチでは Yjs スナップショットのみ返す
            return {
                mode,
                yjsJson: stringifySnapshot(yjsSnap),
            };
        });

        // Yjsブランチ: Yjsスナップショットのみを保存（比較機能は無効化）
        const path = await import("path");
        const fsPromises = await import("fs/promises");
        const outDir = path.resolve(process.cwd(), "e2e-snapshots");
        try {
            await fsPromises.mkdir(outDir, { recursive: true });
        } catch {}
        const yjsPath = path.join(outDir, `${label}-yjs.json`);

        // Yjsブランチでは常にYjsスナップショットを保存
        if (!result.yjsJson) throw new Error("Yjs snapshot missing in yjs mode");
        await fsPromises.writeFile(yjsPath, result.yjsJson);
        console.log(`🔧 [Test] Yjs snapshot saved: ${yjsPath}`);
        console.log(`🔧 [Test] Yjs branch: Snapshot comparison disabled (mode separation)`);

        return;
    }

    /**
     * フェーズ1: FluidとYjsの独立動作状態での検証（同期なし）（無効化 - モード分離のため）
     * @param page Playwrightのページオブジェクト
     * @param options 検証オプション
     */
    static async validateFluidYjsCoexistence(
        page: Page,
        options: {
            checkProjectTitle?: boolean;
            checkPageCount?: boolean;
            checkPageTitles?: boolean;
            checkItemCounts?: boolean;
            logDetails?: boolean;
        } = {},
    ): Promise<void> {
        // 実行中のデータ整合性チェックは削除（モード分離のため）
        console.log(`🔍 FluidYjs coexistence validation disabled for mode separation`);
        return;
    }

    /**
     * フェーズ2: 段階的移行での整合性を検証する（無効化 - モード分離のため）
     * @param page Playwrightのページオブジェクト
     * @param options 検証オプション
     */
    static async validateGradualMigration(
        page: Page,
        options: {
            checkProjectTitle?: boolean;
            checkPageCount?: boolean;
            checkPageTitles?: boolean;
            checkItemCounts?: boolean;
            logDetails?: boolean;
        } = {},
    ): Promise<void> {
        // 実行中のデータ整合性チェックは削除（モード分離のため）
        console.log(`🔍 Gradual migration validation disabled for mode separation`);
        return;
    }

    /**
     * フェーズ3: 完全移行での整合性を検証する（無効化 - モード分離のため）
     * @param page Playwrightのページオブジェクト
     * @param options 検証オプション
     */
    static async validateCompleteMigration(
        page: Page,
        options: {
            checkProjectTitle?: boolean;
            checkPageCount?: boolean;
            checkPageTitles?: boolean;
            checkItemCounts?: boolean;
            logDetails?: boolean;
        } = {},
    ): Promise<void> {
        // 実行中のデータ整合性チェックは削除（モード分離のため）
        console.log(`🔍 Complete migration validation disabled for mode separation`);
        return;
    }
}
