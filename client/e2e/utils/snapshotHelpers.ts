/**
 * E2Eテスト用のスナップショット保存ヘルパー
 */

import { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export interface ProjectSnapshot {
    mode: "fluid" | "yjs";
    timestamp: string;
    projectTitle: string;
    pages: PageSnapshot[];
}

export interface PageSnapshot {
    id: string;
    title: string;
    items: ItemSnapshot[];
}

export interface ItemSnapshot {
    id: string;
    text: string;
    parentId?: string;
    order?: number;
}

/**
 * Fluidモードでのプロジェクトスナップショットを取得
 */
export async function captureFluidSnapshot(page: Page): Promise<ProjectSnapshot> {
    try {
        console.log("🔍 [Snapshot] captureFluidSnapshot called");
        const snapshot = await page.evaluate(() => {
            try {
                console.log("🔍 [Snapshot] Starting Fluid snapshot capture...");

                // 複数の方法でFluidStoreを取得を試行
                let fluidStore = (window as any).fluidStore;
                if (!fluidStore) {
                    fluidStore = (window as any).__FLUID_STORE__;
                }

                console.log("🔍 [Snapshot] FluidStore found:", !!fluidStore);

                if (!fluidStore) {
                    console.log("🔍 [Snapshot] No FluidStore found, checking window properties...");
                    const windowKeys = Object.keys(window).filter(k => k.toLowerCase().includes("fluid"));
                    console.log("🔍 [Snapshot] Window keys with 'fluid':", windowKeys);

                    // 他の可能性を探す
                    const allWindowKeys = Object.keys(window);
                    console.log("🔍 [Snapshot] All window keys:", allWindowKeys.slice(0, 20)); // 最初の20個だけ表示

                    throw new Error("FluidStore not found");
                }

                console.log("🔍 [Snapshot] FluidStore properties:", Object.keys(fluidStore));

                if (!fluidStore.fluidClient) {
                    console.log("🔍 [Snapshot] No fluidClient found");
                    console.log("🔍 [Snapshot] FluidStore structure:", JSON.stringify(fluidStore, null, 2));
                    throw new Error("FluidClient not found");
                }

                console.log("🔍 [Snapshot] FluidClient properties:", Object.keys(fluidStore.fluidClient));

                if (!fluidStore.fluidClient.project) {
                    console.log("🔍 [Snapshot] No project found");
                    console.log(
                        "🔍 [Snapshot] FluidClient structure:",
                        JSON.stringify(fluidStore.fluidClient, null, 2),
                    );
                    throw new Error("Fluid project not found");
                }

                const project = fluidStore.fluidClient.project;
                const pages: PageSnapshot[] = [];

                console.log("🔍 [Snapshot] Project found, analyzing structure...");

                // プロジェクト構造をデバッグ
                console.log("🔍 [Snapshot] Project structure debug:", {
                    projectKeys: Object.keys(project),
                    hasPages: !!project.pages,
                    pagesType: typeof project.pages,
                    pagesKeys: project.pages ? Object.keys(project.pages) : [],
                    hasItems: !!project.pages?.items,
                    itemsLength: project.pages?.items?.length,
                    itemsType: typeof project.pages?.items,
                    pagesValue: project.pages,
                    itemsValue: project.pages?.items,
                });

                // より詳細なプロジェクト構造の調査
                console.log("🔍 [Snapshot] Detailed project analysis:");
                console.log("🔍 [Snapshot] Project title:", project.title);
                console.log("🔍 [Snapshot] Project items:", project.items);
                console.log("🔍 [Snapshot] Project items length:", project.items?.length);

                if (project.items && project.items.length > 0) {
                    console.log("🔍 [Snapshot] First project item:", project.items[0]);
                    console.log("🔍 [Snapshot] First project item keys:", Object.keys(project.items[0]));
                }

                // プロジェクト内のすべてのページを取得
                console.log("🔍 [Snapshot] Checking project structure for pages...");
                console.log("🔍 [Snapshot] project.pages exists:", !!project.pages);
                console.log("🔍 [Snapshot] project.pages.items exists:", !!(project.pages && project.pages.items));
                console.log("🔍 [Snapshot] project.items exists:", !!project.items);
                console.log("🔍 [Snapshot] project.items length:", project.items ? project.items.length : "N/A");

                if (project.pages && project.pages.items) {
                    console.log("🔍 [Snapshot] Processing pages:", project.pages.items.length);
                    for (const pageItem of project.pages.items) {
                        const items: ItemSnapshot[] = [];

                        console.log("🔍 [Snapshot] Processing page:", {
                            pageId: pageItem.id,
                            pageTitle: pageItem.text,
                            hasItems: !!pageItem.items,
                            itemsType: typeof pageItem.items,
                            itemsKeys: pageItem.items ? Object.keys(pageItem.items) : [],
                            itemsValue: pageItem.items,
                        });

                        // ページ内のすべてのアイテムを取得
                        if (pageItem.items && pageItem.items.items) {
                            console.log("🔍 [Snapshot] Processing items:", pageItem.items.items.length);
                            for (const item of pageItem.items.items) {
                                items.push({
                                    id: item.id,
                                    text: item.text || "",
                                    parentId: item.parentId,
                                    order: item.order,
                                });
                            }
                        } else {
                            console.log("🔍 [Snapshot] No items found in page:", {
                                hasItems: !!pageItem.items,
                                itemsType: typeof pageItem.items,
                                hasItemsItems: !!(pageItem.items && pageItem.items.items),
                                itemsItemsType: pageItem.items ? typeof pageItem.items.items : "undefined",
                            });
                        }

                        pages.push({
                            id: pageItem.id,
                            title: pageItem.text || "Untitled Page",
                            items: items,
                        });
                    }
                } // 次に project.items を試す（ページがここに格納されている可能性）
                else if (project.items && project.items.length > 0) {
                    console.log("🔍 [Snapshot] Processing pages from project.items:", project.items.length);
                    for (const pageItem of project.items) {
                        const items: ItemSnapshot[] = [];
                        console.log("🔍 [Snapshot] Processing page from items:", {
                            pageId: pageItem.id,
                            pageTitle: pageItem.text,
                            hasItems: !!pageItem.items,
                            itemsType: typeof pageItem.items,
                            itemsKeys: pageItem.items ? Object.keys(pageItem.items) : [],
                        });

                        // ページ内のすべてのアイテムを取得
                        if (pageItem.items && pageItem.items.items) {
                            console.log("🔍 [Snapshot] Processing items from page:", pageItem.items.items.length);
                            for (const item of pageItem.items.items) {
                                items.push({
                                    id: item.id,
                                    text: item.text || "",
                                    parentId: item.parentId,
                                    order: item.order,
                                });
                            }
                        } // Fluidでは pageItem.items が直接アイテムの配列の場合もある
                        else if (pageItem.items && Array.isArray(pageItem.items)) {
                            console.log(
                                "🔍 [Snapshot] Processing items directly from pageItem.items:",
                                pageItem.items.length,
                            );
                            for (const item of pageItem.items) {
                                items.push({
                                    id: item.id,
                                    text: item.text || "",
                                    parentId: item.parentId,
                                    order: item.order,
                                });
                            }
                        } // Fluidでは pageItem.items がIterableの場合もある
                        else if (pageItem.items && typeof pageItem.items[Symbol.iterator] === "function") {
                            console.log("🔍 [Snapshot] Processing items from iterable pageItem.items");
                            let itemCount = 0;
                            for (const item of pageItem.items) {
                                items.push({
                                    id: item.id,
                                    text: item.text || "",
                                    parentId: item.parentId,
                                    order: item.order,
                                });
                                itemCount++;
                            }
                            console.log("🔍 [Snapshot] Processed", itemCount, "items from iterable");
                        } else {
                            console.log("🔍 [Snapshot] No items found in page from project.items:", {
                                hasItems: !!pageItem.items,
                                itemsType: typeof pageItem.items,
                                hasItemsItems: !!(pageItem.items && pageItem.items.items),
                                itemsItemsType: pageItem.items ? typeof pageItem.items.items : "undefined",
                                isArray: Array.isArray(pageItem.items),
                                isIterable: pageItem.items
                                    ? typeof pageItem.items[Symbol.iterator] === "function"
                                    : false,
                            });
                        }

                        pages.push({
                            id: pageItem.id,
                            title: pageItem.text || "Untitled Page",
                            items: items,
                        });
                    }
                } else {
                    console.log("🔍 [Snapshot] No pages found in project.pages.items or project.items");
                }

                console.log("🔍 [Snapshot] Final snapshot data:", {
                    projectTitle: project.title || "Untitled Project",
                    pagesCount: pages.length,
                    pages: pages.map(p => ({ id: p.id, title: p.title, itemsCount: p.items.length })),
                });

                return {
                    mode: "fluid" as const,
                    timestamp: new Date().toISOString(),
                    projectTitle: project.title || "Untitled Project",
                    pages: pages,
                };
            } catch (error) {
                console.error("🔍 [Snapshot] Error in page.evaluate:", error);
                throw error;
            }
        });

        console.log("🔍 [Snapshot] Fluid snapshot captured successfully");
        return snapshot;
    } catch (error) {
        console.error("🔍 [Snapshot] Error in captureFluidSnapshot:", error);
        console.error("🔍 [Snapshot] Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        throw error;
    }
}

/**
 * Yjsモードでのプロジェクトスナップショットを取得
 */
export async function captureYjsSnapshot(page: Page): Promise<ProjectSnapshot> {
    try {
        console.log("🔍 [Snapshot] captureYjsSnapshot called");

        const snapshot = await page.evaluate(() => {
            try {
                console.log("🔍 [Snapshot] Starting Yjs snapshot capture...");

                const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
                if (!yjsProjectManager) {
                    console.log("🔍 [Snapshot] YjsProjectManager not found in window");
                    throw new Error("Yjs project manager not found");
                }

                console.log("🔍 [Snapshot] YjsProjectManager found:", !!yjsProjectManager);

                const pages: PageSnapshot[] = [];

                // ページ一覧を取得
                const yjsPages = yjsProjectManager.getPages();
                console.log("🔍 [Snapshot] Yjs pages found:", yjsPages.length);

                for (const yjsPage of yjsPages) {
                    const items: ItemSnapshot[] = [];

                    console.log("🔍 [Snapshot] Processing Yjs page:", {
                        pageId: yjsPage.id,
                        pageTitle: yjsPage.title,
                    });

                    // Yjsページからアイテムを取得
                    try {
                        // getPageManagerメソッドを使用してTreeManagerを取得
                        const treeManager = yjsProjectManager.getPageManager(yjsPage.id);
                        if (treeManager) {
                            console.log("🔍 [Snapshot] TreeManager found for page:", yjsPage.id);

                            // YjsOrderedTreeManagerでは再帰的にアイテムを取得する必要がある
                            const collectAllItems = (parentId = "root") => {
                                const allItems = [];

                                try {
                                    let children;
                                    if (parentId === "root") {
                                        children = treeManager.getRootItems();
                                    } else {
                                        children = treeManager.getChildren(parentId);
                                    }

                                    if (children && Array.isArray(children)) {
                                        for (const child of children) {
                                            allItems.push(child);
                                            // 再帰的に子アイテムも取得
                                            const grandChildren = collectAllItems(child.id);
                                            allItems.push(...grandChildren);
                                        }
                                    }
                                } catch (error) {
                                    console.warn(`🔍 [Snapshot] Failed to get children for ${parentId}:`, error);
                                }

                                return allItems;
                            };

                            const allItems = collectAllItems();
                            console.log("🔍 [Snapshot] Items found in page:", allItems.length);

                            for (const item of allItems) {
                                console.log("🔍 [Snapshot] Processing Yjs item:", {
                                    id: item.id,
                                    text: item.text,
                                    textType: typeof item.text,
                                    itemKeys: Object.keys(item),
                                    fullItem: item,
                                });

                                items.push({
                                    id: item.id,
                                    text: item.text || "",
                                    parentId: item.parentId || "root",
                                    order: item.order || 0,
                                });
                            }
                        } else {
                            console.log("🔍 [Snapshot] No TreeManager found for page:", yjsPage.id);

                            // TreeManagerが見つからない場合はスキップ（page.evaluate内ではawaitを使用できない）
                            console.log("🔍 [Snapshot] TreeManager not available for page:", yjsPage.id);
                        }
                    } catch (error) {
                        console.warn(`🔍 [Snapshot] Failed to get items for page ${yjsPage.id}:`, error);
                    }

                    pages.push({
                        id: yjsPage.id,
                        title: yjsPage.title || "Untitled Page",
                        items: items,
                    });
                }

                const projectMetadata = yjsProjectManager.getProjectMetadata();
                console.log("🔍 [Snapshot] Project metadata:", projectMetadata);

                console.log("🔍 [Snapshot] Final Yjs snapshot data:", {
                    projectTitle: projectMetadata?.title || "Untitled Project",
                    pagesCount: pages.length,
                    pages: pages.map(p => ({ id: p.id, title: p.title, itemsCount: p.items.length })),
                });

                return {
                    mode: "yjs" as const,
                    timestamp: new Date().toISOString(),
                    projectTitle: projectMetadata?.title || "Untitled Project",
                    pages: pages,
                };
            } catch (error) {
                console.error("🔍 [Snapshot] Error in Yjs page.evaluate:", error);
                throw error;
            }
        });

        console.log("🔍 [Snapshot] Yjs snapshot captured successfully");
        return snapshot;
    } catch (error) {
        console.error("🔍 [Snapshot] Error in captureYjsSnapshot:", error);
        console.error("🔍 [Snapshot] Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        throw error;
    }
}

/**
 * 現在のモードに応じてスナップショットを取得
 */
export async function captureSnapshot(page: Page): Promise<ProjectSnapshot> {
    try {
        console.log("🔍 [Snapshot] Starting snapshot capture...");

        const mode = await page.evaluate(() => {
            console.log("🔍 [Snapshot] Getting mode from localStorage...");
            const mode = localStorage.getItem("OUTLINER_MODE") || "fluid";
            console.log("🔍 [Snapshot] Mode:", mode);
            return mode;
        });

        console.log("🔍 [Snapshot] Mode determined:", mode);

        if (mode === "yjs") {
            console.log("🔍 [Snapshot] Capturing Yjs snapshot...");
            return await captureYjsSnapshot(page);
        } else {
            console.log("🔍 [Snapshot] Capturing Fluid snapshot...");
            return await captureFluidSnapshot(page);
        }
    } catch (error) {
        console.error("🔍 [Snapshot] Error in captureSnapshot:", error);
        throw error;
    }
}

/**
 * スナップショットをJSONファイルに保存
 */
export function saveSnapshot(snapshot: ProjectSnapshot, testName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `snapshot-${snapshot.mode}-${testName}-${timestamp}.json`;
    const snapshotsDir = join(process.cwd(), "test-results", "snapshots");

    // ディレクトリを作成
    mkdirSync(snapshotsDir, { recursive: true });

    const filepath = join(snapshotsDir, filename);
    writeFileSync(filepath, JSON.stringify(snapshot, null, 2), "utf-8");

    console.log(`📸 Snapshot saved: ${filepath}`);
    return filepath;
}

/**
 * 2つのスナップショットを比較（IDと作成時刻を除く）
 */
export function compareSnapshots(snapshot1: ProjectSnapshot, snapshot2: ProjectSnapshot): {
    isEqual: boolean;
    differences: string[];
} {
    const differences: string[] = [];

    // プロジェクトタイトルを比較
    if (snapshot1.projectTitle !== snapshot2.projectTitle) {
        differences.push(`Project title: "${snapshot1.projectTitle}" vs "${snapshot2.projectTitle}"`);
    }

    // ページ数を比較
    if (snapshot1.pages.length !== snapshot2.pages.length) {
        differences.push(`Page count: ${snapshot1.pages.length} vs ${snapshot2.pages.length}`);
    }

    // 各ページを比較
    const minPages = Math.min(snapshot1.pages.length, snapshot2.pages.length);
    for (let i = 0; i < minPages; i++) {
        const page1 = snapshot1.pages[i];
        const page2 = snapshot2.pages[i];

        // ページタイトルを比較
        if (page1.title !== page2.title) {
            differences.push(`Page ${i} title: "${page1.title}" vs "${page2.title}"`);
        }

        // アイテム数を比較
        if (page1.items.length !== page2.items.length) {
            differences.push(`Page ${i} item count: ${page1.items.length} vs ${page2.items.length}`);
        }

        // 各アイテムを比較（IDと作成時刻を除く）
        const minItems = Math.min(page1.items.length, page2.items.length);
        for (let j = 0; j < minItems; j++) {
            const item1 = page1.items[j];
            const item2 = page2.items[j];

            // テキストを比較
            if (item1.text !== item2.text) {
                differences.push(`Page ${i} item ${j} text: "${item1.text}" vs "${item2.text}"`);
            }

            // 親IDを比較（両方ともundefinedでない場合のみ）
            if (item1.parentId && item2.parentId && item1.parentId !== item2.parentId) {
                differences.push(`Page ${i} item ${j} parentId: "${item1.parentId}" vs "${item2.parentId}"`);
            }
        }
    }

    return {
        isEqual: differences.length === 0,
        differences: differences,
    };
}
