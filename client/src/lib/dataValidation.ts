// FluidとYjsのデータ整合性を検証するユーティリティ
import type { FluidClient } from "../fluid/fluidClient";
import { Item, Items, Project } from "../schema/app-schema";
import { getLogger } from "./logger";
import type { YjsProjectManager } from "./yjsProjectManager.svelte";

const logger = getLogger();

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    details: {
        fluidData: any;
        yjsData: any;
    };
}

export interface ProjectValidationResult extends ValidationResult {
    projectTitle: {
        fluid: string;
        yjs: string;
        matches: boolean;
    };
    pageCount: {
        fluid: number;
        yjs: number;
        matches: boolean;
    };
    pages: PageValidationResult[];
}

export interface PageValidationResult extends ValidationResult {
    pageId: string;
    title: {
        fluid: string;
        yjs: string;
        matches: boolean;
    };
    itemCount: {
        fluid: number;
        yjs: number;
        matches: boolean;
    };
    items: ItemValidationResult[];
}

export interface ItemValidationResult {
    index: number;
    fluid: {
        id: string;
        text: string;
        author?: string;
        created?: number;
        lastChanged?: number;
    } | null;
    yjs: {
        id: string;
        text: string;
        author?: string;
        created?: number;
        lastChanged?: number;
    } | null;
    matches: boolean;
    differences: string[];
}

/**
 * FluidとYjsのデータ整合性を検証するクラス
 */
export class DataValidator {
    /**
     * プロジェクト全体のデータ整合性を検証
     */
    static async validateProject(
        fluidClient: FluidClient,
        yjsProjectManager: YjsProjectManager,
        options: {
            checkProjectTitle?: boolean;
            checkPageCount?: boolean;
            checkPageTitles?: boolean;
            checkItemCounts?: boolean;
        } = {},
    ): Promise<ProjectValidationResult> {
        const {
            checkProjectTitle = true,
            checkPageCount = true,
            checkPageTitles = true,
            checkItemCounts = true,
        } = options;
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Fluidプロジェクトデータを取得
            let fluidProject: Project | undefined | null = null;
            if (typeof (fluidClient as any)?.getProject === "function") {
                fluidProject = (fluidClient as any).getProject();
            } else {
                console.warn("fluidClient.getProject is not available, using fallback");
            }
            // フォールバック: プロジェクトが未定義の場合は空インスタンスを生成
            if (!fluidProject) {
                fluidProject = Project.createInstance("");
            }
            const fluidPages = this.getFluidPages(fluidProject as Project);

            // Yjsプロジェクトデータを取得
            const yjsMetadata = yjsProjectManager.getProjectMetadata();
            const yjsPages = yjsProjectManager.getPages();

            // プロジェクトタイトルの比較（オプション）
            const fluidTitle = String((fluidProject as any)?.title || "");
            const yjsTitle = String(yjsMetadata?.title || "");
            const projectTitleMatches = fluidTitle === yjsTitle;

            if (checkProjectTitle) {
                if (!projectTitleMatches) {
                    errors.push(`Project title mismatch: Fluid="${fluidTitle}", Yjs="${yjsTitle}"`);
                    logger.warn(`Title comparison details:`);
                    logger.warn(`  Fluid title: "${fluidTitle}" (length: ${fluidTitle.length})`);
                    logger.warn(`  Yjs title: "${yjsTitle}" (length: ${yjsTitle.length})`);
                    logger.warn(`  Fluid title type: ${typeof fluidTitle}`);
                    logger.warn(`  Yjs title type: ${typeof yjsTitle}`);
                } else {
                    logger.info(`Project titles match: "${fluidTitle}"`);
                }
            } else {
                logger.info(`Project title check skipped`);
            }

            // ページ数の比較
            const pageCountMatches = fluidPages.length === yjsPages.length;
            if (!pageCountMatches) {
                // デバッグ情報を追加
                logger.warn(`Page count mismatch details:`);
                logger.warn(`  Fluid pages (${fluidPages.length}):`);
                fluidPages.forEach((page, index) => {
                    logger.warn(`    ${index + 1}. "${String(page.text)}" (id: ${page.id})`);
                });
                logger.warn(`  Yjs pages (${yjsPages.length}):`);
                yjsPages.forEach((page, index) => {
                    logger.warn(`    ${index + 1}. "${page.title}" (id: ${page.id})`);
                });

                warnings.push(`Page count mismatch: Fluid=${fluidPages.length}, Yjs=${yjsPages.length}`);
            }

            // 各ページの詳細検証
            const pageValidations: PageValidationResult[] = [];
            for (const fluidPage of fluidPages) {
                const yjsPage = yjsPages.find(p => p.title === fluidPage.text);
                if (yjsPage) {
                    const pageValidation = await this.validatePage(fluidPage, yjsPage, yjsProjectManager, fluidClient);
                    pageValidations.push(pageValidation);
                } else {
                    errors.push(`Yjs page not found for Fluid page: "${fluidPage.text}"`);
                    pageValidations.push({
                        isValid: false,
                        errors: [`Yjs page not found for Fluid page: "${fluidPage.text}"`],
                        warnings: [],
                        details: { fluidData: fluidPage, yjsData: null },
                        pageId: String(fluidPage.id),
                        title: { fluid: String(fluidPage.text), yjs: "", matches: false },
                        itemCount: {
                            fluid: Array.isArray(fluidPage.items) ? fluidPage.items.length : 0,
                            yjs: 0,
                            matches: false,
                        },
                        items: [],
                    });
                }
            }

            // Yjsにのみ存在するページをチェック
            for (const yjsPage of yjsPages) {
                const fluidPage = fluidPages.find(p => p.text === yjsPage.title);
                if (!fluidPage) {
                    warnings.push(`Fluid page not found for Yjs page: "${yjsPage.title}"`);
                }
            }

            const isValid = errors.length === 0;

            return {
                isValid,
                errors,
                warnings,
                details: {
                    fluidData: {
                        title: fluidProject.title,
                        pageCount: fluidPages.length,
                        pages: fluidPages.map(p => ({
                            id: p.id,
                            title: p.text,
                            itemCount: Array.isArray(p.items) ? p.items.length : 0,
                        })),
                    },
                    yjsData: {
                        title: yjsMetadata?.title,
                        pageCount: yjsPages.length,
                        pages: yjsPages.map(p => ({ id: p.id, title: p.title, order: p.order })),
                    },
                },
                projectTitle: {
                    fluid: fluidTitle,
                    yjs: yjsTitle,
                    matches: projectTitleMatches,
                },
                pageCount: {
                    fluid: fluidPages.length,
                    yjs: yjsPages.length,
                    matches: pageCountMatches,
                },
                pages: pageValidations,
            };
        } catch (error) {
            logger.error("Error during project validation:", error);
            errors.push(`Validation error: ${error}`);

            return {
                isValid: false,
                errors,
                warnings,
                details: { fluidData: null, yjsData: null },
                projectTitle: { fluid: "", yjs: "", matches: false },
                pageCount: { fluid: 0, yjs: 0, matches: false },
                pages: [],
            };
        }
    }

    /**
     * 個別ページのデータ整合性を検証
     */
    static async validatePage(
        fluidPage: Item,
        yjsPageMetadata: any,
        yjsProjectManager: YjsProjectManager,
        fluidClient: FluidClient,
    ): Promise<PageValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // ページタイトルの比較
            const fluidPageText = String(fluidPage.text);
            const yjsPageTitle = String(yjsPageMetadata.title);
            const titleMatches = fluidPageText === yjsPageTitle;
            if (!titleMatches) {
                errors.push(`Page title mismatch: Fluid="${fluidPageText}", Yjs="${yjsPageTitle}"`);
            }

            // Fluidページのアイテム数を取得
            // ページタイトルアイテムの子アイテムを数える（ページタイトル自体も含める）
            let fluidItemCount = 0;

            // Fluidページの詳細な構造をデバッグ
            console.log(`[DEBUG] Fluid page object:`, {
                id: fluidPage.id,
                text: fluidPage.text,
                hasItems: !!fluidPage.items,
                itemsType: typeof fluidPage.items,
                itemsIsArray: Array.isArray(fluidPage.items),
                itemsLength: fluidPage.items ? (fluidPage.items as any).length : "N/A",
                keys: Object.keys(fluidPage),
                itemsKeys: fluidPage.items ? Object.keys(fluidPage.items) : "N/A",
                itemsValue: fluidPage.items,
            });

            // まず、ページタイトルアイテム自体の子アイテムを確認
            if (fluidPage && fluidPage.items) {
                if (Array.isArray(fluidPage.items)) {
                    fluidItemCount = fluidPage.items.length;
                    console.log(`[DEBUG] Found direct items on page (array):`, fluidPage.items.length);
                    fluidPage.items.forEach((item: any, index: number) => {
                        console.log(`[DEBUG] Direct item ${index}:`, { id: item.id, text: item.text });
                    });
                } else {
                    // Proxy(Items)オブジェクトの場合、数値キーでアクセス
                    const itemsObj = fluidPage.items;
                    const numericKeys = Object.keys(itemsObj).filter(key => /^\d+$/.test(key));
                    fluidItemCount = numericKeys.length;
                    console.log(`[DEBUG] Found direct items on page (object):`, fluidItemCount);
                    numericKeys.forEach((key, index) => {
                        const item = (itemsObj as any)[key];
                        console.log(`[DEBUG] Direct item ${index} (key: ${key}):`, { id: item.id, text: item.text });
                    });
                }
            } else {
                // 代替方法：プロジェクト全体からページのアイテムを探す
                let project = null;
                if (typeof fluidClient.getProject === "function") {
                    project = fluidClient.getProject() as any;
                } else {
                    console.warn("fluidClient.getProject is not available in getFluidPageItems");
                }
                console.log(`[DEBUG] Project structure:`, {
                    hasProject: !!project,
                    hasItems: !!(project && project.items),
                    hasItemsItems: !!(project && project.items && project.items.items),
                    projectKeys: project ? Object.keys(project) : "N/A",
                    itemsKeys: (project && project.items) ? Object.keys(project.items) : "N/A",
                    itemsValue: (project && project.items) ? project.items : "N/A",
                });

                if (project && project.items) {
                    // project.itemsは直接アイテムを含んでいる
                    const allItems = Object.values(project.items).filter((item: any) =>
                        item && typeof item === "object" && item.id
                    );
                    console.log(`[DEBUG] Total items in project:`, allItems.length);

                    // 全アイテムの構造を確認
                    allItems.forEach((item: any, index: number) => {
                        console.log(`[DEBUG] Project item ${index}:`, {
                            id: item.id,
                            text: item.text,
                            hasParent: !!item.parent,
                            parentId: item.parent ? item.parent.id : "N/A",
                            parentText: item.parent ? item.parent.text : "N/A",
                            hasItems: !!item.items,
                            itemsType: typeof item.items,
                            itemsIsArray: Array.isArray(item.items),
                            itemsLength: item.items
                                ? (Array.isArray(item.items) ? item.items.length : Object.keys(item.items).length)
                                : 0,
                        });

                        // ページタイトルアイテムの場合、その子アイテムを詳しく調査
                        if (item.id === fluidPage.id && item.items) {
                            console.log(`[DEBUG] Page title item children:`, item.items);
                            if (Array.isArray(item.items)) {
                                item.items.forEach((child: any, childIndex: number) => {
                                    console.log(`[DEBUG] Child ${childIndex}:`, {
                                        id: child.id,
                                        text: child.text,
                                        type: typeof child,
                                    });
                                });
                            } else {
                                Object.entries(item.items).forEach(
                                    ([key, child]: [string, any], childIndex: number) => {
                                        console.log(`[DEBUG] Child ${childIndex} (key: ${key}):`, {
                                            id: child.id,
                                            text: child.text,
                                            type: typeof child,
                                        });
                                    },
                                );
                            }
                        }
                    });

                    const pageItems = allItems.filter((item: any) => {
                        // ページタイトルアイテムの子アイテムを探す
                        const parent = item.parent;
                        const isChildOfPage = parent && parent.id === fluidPage.id;
                        if (isChildOfPage) {
                            console.log(`[DEBUG] Found child item:`, {
                                id: item.id,
                                text: item.text,
                                parentId: parent.id,
                            });
                        }
                        return isChildOfPage;
                    });
                    fluidItemCount = pageItems.length;
                    console.log(`[DEBUG] Found ${pageItems.length} child items for page ${fluidPage.id}`);
                }
            }

            // 正規化ルール: タイトルはカウントに含めない（Yjs側と同じ基準）

            console.log(`[DEBUG] Fluid page "${fluidPageText}" items:`, {
                hasDirectItems: Array.isArray(fluidPage.items),
                itemCount: fluidItemCount,
                pageId: fluidPage.id,
                note: "Includes page title as first item",
            });

            // Yjsページのアイテム数を取得（タイトル+子+その他ルートでカウント）
            let yjsItemCount = 0;
            try {
                console.log(`[DEBUG] Connecting to Yjs page: ${yjsPageMetadata.id}`);
                const pageManager = await yjsProjectManager.connectToPage(yjsPageMetadata.id);
                console.log(`[DEBUG] Page manager connected:`, !!pageManager);

                const rootItems = pageManager.getRootItems();
                const pageTitle = String(yjsPageTitle);
                const pageTitleItem = rootItems.find(item => item.text === pageTitle);

                if (pageTitleItem) {
                    const childItems = pageManager.getChildren(pageTitleItem.id);
                    // 正規化ルール: タイトルノードは除外し、比較対象は「タイトル直下の子要素」
                    if (childItems.length > 0) {
                        yjsItemCount = childItems.length;
                    } else {
                        // タイトル直下に子が無い場合は、同階層のルート直下（タイトル以外）を比較対象とする
                        yjsItemCount = rootItems.filter(item => item.id !== pageTitleItem.id).length;
                    }
                } else {
                    // タイトルが見つからない場合はルート直下をそのまま比較対象とする
                    yjsItemCount = rootItems.length;
                }

                console.log(`[DEBUG] Yjs page "${yjsPageTitle}" items (counted as [title + children + others]):`, {
                    itemCount: yjsItemCount,
                    rootCount: rootItems.length,
                });
            } catch (error) {
                console.error(`[DEBUG] Error getting Yjs page items:`, error);
                warnings.push(`Could not get Yjs page items: ${error}`);
            }

            // アイテム数の比較
            const itemCountMatches = fluidItemCount === yjsItemCount;
            if (!itemCountMatches) {
                warnings.push(
                    `Item count mismatch for page "${fluidPage.text}": Fluid=${fluidItemCount}, Yjs=${yjsItemCount}`,
                );
            }

            // 詳細なアイテム比較
            console.log(`[DEBUG] validatePage: Starting item validation for page "${fluidPageText}"`);
            const itemValidations = await this.validatePageItems(
                fluidPage,
                yjsPageMetadata,
                yjsProjectManager,
                fluidClient,
            );
            console.log(
                `[DEBUG] validatePage: Item validation completed, found ${itemValidations.length} item comparisons`,
            );

            // アイテム比較で見つかったエラーと警告を追加
            itemValidations.forEach(itemValidation => {
                if (!itemValidation.matches) {
                    itemValidation.differences.forEach(diff => {
                        warnings.push(`Item ${itemValidation.index}: ${diff}`);
                    });
                }
            });

            const isValid = errors.length === 0;

            return {
                isValid,
                errors,
                warnings,
                details: {
                    fluidData: {
                        id: fluidPage.id,
                        title: fluidPageText,
                        itemCount: fluidItemCount,
                    },
                    yjsData: {
                        id: yjsPageMetadata.id,
                        title: yjsPageTitle,
                        itemCount: yjsItemCount,
                    },
                },
                pageId: String(fluidPage.id),
                title: {
                    fluid: fluidPageText,
                    yjs: yjsPageTitle,
                    matches: titleMatches,
                },
                itemCount: {
                    fluid: fluidItemCount,
                    yjs: yjsItemCount,
                    matches: itemCountMatches,
                },
                items: itemValidations,
            };
        } catch (error) {
            console.error("Error during page validation:", error);
            errors.push(`Page validation error: ${error}`);

            return {
                isValid: false,
                errors,
                warnings,
                details: { fluidData: null, yjsData: null },
                pageId: String(fluidPage.id),
                title: { fluid: String(fluidPage.text), yjs: "", matches: false },
                itemCount: { fluid: 0, yjs: 0, matches: false },
                items: [],
            };
        }
    }

    /**
     * ページ内のアイテムの詳細比較を実行
     */
    static async validatePageItems(
        fluidPage: Item,
        yjsPageMetadata: any,
        yjsProjectManager: YjsProjectManager,
        fluidClient?: FluidClient,
    ): Promise<ItemValidationResult[]> {
        const results: ItemValidationResult[] = [];

        try {
            // Fluidページのアイテムを取得（validatePageメソッドと同じロジックを使用）
            let fluidItems: any[] = [];

            // まず、ページタイトルアイテム自体の子アイテムを確認
            console.log(`🔍 [DataValidator] Getting Fluid page items...`);
            if (fluidPage && fluidPage.items) {
                if (Array.isArray(fluidPage.items)) {
                    fluidItems = [...fluidPage.items];
                    console.log(`🔍 [DataValidator] Found direct items on page (array): ${fluidPage.items.length}`);

                    // 配列アイテムの詳細をログ出力
                    fluidItems.forEach((item, index) => {
                        console.log(
                            `🔍 [DataValidator] Fluid array item ${index}: id="${item.id}", text="${item.text}"`,
                        );
                    });
                } else if (typeof fluidPage.items === "object") {
                    // オブジェクト形式の場合、値を配列として取得
                    fluidItems = Object.values(fluidPage.items).filter((item: any) =>
                        item && typeof item === "object" && item.id
                    );
                    console.log(`🔍 [DataValidator] Found direct items on page (object): ${fluidItems.length}`);

                    // オブジェクトアイテムの詳細をログ出力
                    fluidItems.forEach((item, index) => {
                        console.log(
                            `🔍 [DataValidator] Fluid object item ${index}: id="${item.id}", text="${item.text}"`,
                        );
                    });
                }
            }

            // 直接アイテムが見つからない場合、プロジェクト全体から探す
            if (fluidItems.length === 0 && fluidClient) {
                console.log(`🔍 [DataValidator] No direct items found, searching in project`);
                let project = null;
                if (typeof fluidClient.getProject === "function") {
                    project = fluidClient.getProject() as any;
                } else {
                    console.warn("fluidClient.getProject is not available in validatePageItems");
                }

                if (project && project.items) {
                    const allItems = Object.values(project.items).filter((item: any) =>
                        item && typeof item === "object" && item.id
                    );
                    console.log(`[DEBUG] validatePageItems: Total items in project:`, allItems.length);

                    const pageItems = allItems.filter((item: any) => {
                        const parent = item.parent;
                        const isChildOfPage = parent && parent.id === fluidPage.id;
                        if (isChildOfPage) {
                            console.log(`[DEBUG] validatePageItems: Found child item:`, {
                                id: item.id,
                                text: item.text,
                                parentId: parent.id,
                            });
                        }
                        return isChildOfPage;
                    });
                    fluidItems = pageItems;
                    console.log(
                        `[DEBUG] validatePageItems: Found ${pageItems.length} child items for page ${fluidPage.id}`,
                    );
                }
            }

            // 正規化ルール: Fluid側もページタイトルは比較対象から除外する
            const pageTitle = String(fluidPage.text || "");
            console.log(`🔍 [DataValidator] Using Fluid items without page title: "${pageTitle}"`);

            console.log(`🔍 [DataValidator] Final fluid items count (children only): ${fluidItems.length}`);

            // 最終的なFluidアイテムをログ出力
            fluidItems.forEach((item, index) => {
                console.log(`🔍 [DataValidator] Final Fluid item ${index}: id="${item.id}", text="${item.text}"`);
            });

            // Yjsページのアイテムを取得（階層構造を平坦化）
            let yjsItems: any[] = [];
            try {
                console.log(`🔍 [DataValidator] Connecting to Yjs page: ${yjsPageMetadata.id}`);
                const pageManager = await yjsProjectManager.connectToPage(yjsPageMetadata.id);
                console.log(`🔍 [DataValidator] Connected to page manager`);

                const rootItems = pageManager.getRootItems();
                console.log(`🔍 [DataValidator] Root Yjs items count: ${rootItems.length}`);

                // ルートアイテムの詳細をログ出力
                rootItems.forEach((item, index) => {
                    console.log(`🔍 [DataValidator] Root Yjs item ${index}: id="${item.id}", text="${item.text}"`);
                });

                const pageTitle = String(yjsPageMetadata.title || "");
                console.log(`🔍 [DataValidator] Page title: "${pageTitle}"`);

                // ページタイトルアイテムを見つける
                const pageTitleItem = rootItems.find(item => item.text === pageTitle);

                if (pageTitleItem) {
                    console.log(`🔍 [DataValidator] Found page title item: ${pageTitleItem.id}`);

                    // ページタイトルアイテムの子アイテムを取得
                    const childItems = pageManager.getChildren(pageTitleItem.id);
                    console.log(`🔍 [DataValidator] Page title children count: ${childItems.length}`);

                    // 子アイテムの詳細をログ出力
                    childItems.forEach((item, index) => {
                        console.log(`🔍 [DataValidator] Child item ${index}: id="${item.id}", text="${item.text}"`);
                    });

                    // 正規化ルール: タイトルノードは除外
                    if (childItems.length > 0) {
                        yjsItems = childItems;
                    } else {
                        // タイトル直下に子が無い場合は、同階層のルート直下（タイトル以外）を比較対象にする
                        yjsItems = rootItems.filter(item => item.id !== pageTitleItem.id);
                    }
                } else {
                    console.log(`🔍 [DataValidator] Page title item not found, using all root items`);
                    yjsItems = rootItems;
                }

                console.log(`🔍 [DataValidator] Final Yjs items count: ${yjsItems.length}`);

                // 最終的なアイテムをログ出力
                yjsItems.forEach((item, index) => {
                    console.log(`🔍 [DataValidator] Final Yjs item ${index}: id="${item.id}", text="${item.text}"`);
                });
            } catch (error) {
                console.error(`🔍 [DataValidator] Error getting Yjs items:`, error);
                logger.warn(`Could not get Yjs page items for comparison: ${error}`);
            }

            // 位置ベースでアイテムを比較（ID差は無視してテキスト一致を厳密比較）
            console.log(
                `[DEBUG] validatePageItems: Comparing items by position (Fluid: ${fluidItems.length}, Yjs: ${yjsItems.length})`,
            );

            const maxLen = Math.max(fluidItems.length, yjsItems.length);
            for (let i = 0; i < maxLen; i++) {
                const fluidItem = fluidItems[i] ?? null;
                const yjsItem = yjsItems[i] ?? null;
                const itemResult = this.compareItems(i, fluidItem as any, yjsItem as any);
                results.push(itemResult);
            }
        } catch (error) {
            console.error("Error during page items validation:", error);
            // エラーが発生した場合は空の結果を返す
        }

        return results;
    }

    /**
     * 個別アイテムの比較
     */
    private static compareItems(
        index: number,
        fluidItem: Item | null,
        yjsItem: any | null,
    ): ItemValidationResult {
        const differences: string[] = [];
        const warnings: string[] = [];

        // 両方がnullの場合は一致
        if (!fluidItem && !yjsItem) {
            return {
                index,
                fluid: null,
                yjs: null,
                matches: true,
                differences: [],
            };
        }

        // 片方がnullの場合は不一致
        if (!fluidItem) {
            differences.push(`Fluid item missing at index ${index}`);
        }
        if (!yjsItem) {
            differences.push(`Yjs item missing at index ${index}`);
        }

        // 両方が存在する場合の詳細比較
        if (fluidItem && yjsItem) {
            // テキストの比較（重要な不一致）
            const fluidText = String(fluidItem.text);
            const yjsText = String(yjsItem.text);
            if (fluidText !== yjsText) {
                differences.push(`Text mismatch: Fluid="${fluidText}", Yjs="${yjsText}"`);
            }

            // IDの比較（警告レベル - 独立システムなので期待される）
            const fluidId = String(fluidItem.id);
            const yjsId = String(yjsItem.id);
            if (fluidId !== yjsId) {
                warnings.push(`ID mismatch: Fluid="${fluidId}", Yjs="${yjsId}"`);
            }

            // 作成者の比較（警告レベル）
            const fluidAuthor = fluidItem.author ? String(fluidItem.author) : undefined;
            const yjsAuthor = yjsItem.author ? String(yjsItem.author) : undefined;
            if (fluidAuthor !== yjsAuthor) {
                warnings.push(`Author mismatch: Fluid="${fluidAuthor}", Yjs="${yjsAuthor}"`);
            }

            // 作成日時の比較（警告レベル）
            const fluidCreated = typeof fluidItem.created === "number" ? fluidItem.created : undefined;
            const yjsCreated = typeof yjsItem.created === "number" ? yjsItem.created : undefined;
            if (fluidCreated !== yjsCreated) {
                warnings.push(`Created time mismatch: Fluid="${fluidCreated}", Yjs="${yjsCreated}"`);
            }

            // 最終更新日時の比較（警告レベル）
            const fluidLastChanged = typeof fluidItem.lastChanged === "number" ? fluidItem.lastChanged : undefined;
            const yjsLastChanged = typeof yjsItem.lastChanged === "number" ? yjsItem.lastChanged : undefined;
            if (fluidLastChanged !== yjsLastChanged) {
                warnings.push(`Last changed time mismatch: Fluid="${fluidLastChanged}", Yjs="${yjsLastChanged}"`);
            }
        }

        // 警告をログに出力（エラーではない）
        if (warnings.length > 0) {
            console.log(`[INFO] Item ${index} warnings (expected for independent systems): ${warnings.join(", ")}`);
        }

        return {
            index,
            fluid: fluidItem
                ? {
                    id: String(fluidItem.id),
                    text: String(fluidItem.text),
                    author: fluidItem.author ? String(fluidItem.author) : undefined,
                    created: typeof fluidItem.created === "number" ? fluidItem.created : undefined,
                    lastChanged: typeof fluidItem.lastChanged === "number" ? fluidItem.lastChanged : undefined,
                }
                : null,
            yjs: yjsItem
                ? {
                    id: String(yjsItem.id),
                    text: String(yjsItem.text),
                    author: yjsItem.author ? String(yjsItem.author) : undefined,
                    created: typeof yjsItem.created === "number" ? yjsItem.created : undefined,
                    lastChanged: typeof yjsItem.lastChanged === "number" ? yjsItem.lastChanged : undefined,
                }
                : null,
            matches: differences.length === 0, // 重要な不一致のみをチェック
            differences,
        };
    }

    /**
     * Fluidプロジェクトからページリストを取得
     */
    private static getFluidPages(project: Project): Item[] {
        const items = project.items as Items;
        return items ? [...items] : [];
    }

    /**
     * 検証結果をログに出力
     */
    static logValidationResult(result: ProjectValidationResult): void {
        if (result.isValid) {
            logger.info("✅ Data validation passed");
        } else {
            logger.warn("❌ Data validation failed");
            result.errors.forEach(error => logger.error(`  Error: ${error}`));
        }

        if (result.warnings.length > 0) {
            result.warnings.forEach(warning => logger.warn(`  Warning: ${warning}`));
        }

        logger.info(`Project title match: ${result.projectTitle.matches ? "✅" : "❌"}`);
        logger.info(
            `Page count match: ${
                result.pageCount.matches ? "✅" : "❌"
            } (Fluid: ${result.pageCount.fluid}, Yjs: ${result.pageCount.yjs})`,
        );

        result.pages.forEach((page, index) => {
            const status = page.isValid ? "✅" : "❌";
            logger.info(`  Page ${index + 1}: ${status} "${page.title.fluid}"`);

            // アイテムの詳細情報を出力
            if (page.items && page.items.length > 0) {
                const mismatchedItems = page.items.filter(item => !item.matches);
                if (mismatchedItems.length > 0) {
                    logger.warn(`    Mismatched items: ${mismatchedItems.length}`);
                    mismatchedItems.forEach(item => {
                        logger.warn(`      Item ${item.index}: ${item.differences.join(", ")}`);
                    });
                }
            }
        });
    }
}
