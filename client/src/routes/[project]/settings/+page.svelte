<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { onMount } from "svelte";
import {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "../../../services";
// import { fluidStore } from "../../../stores/fluidStore.svelte"; // Yjsモードでは無効化
import { store } from "../../../stores/store.svelte";

let project: any = undefined;
let exportText = $state("");
let importText = $state("");
let importFormat = $state("opml");

onMount(() => {
    // Yjsモードでは簡易プロジェクト情報を使用
    project = store.project;
});

function doExport(format: "opml" | "markdown") {
    if (!project) return;
    exportText = format === "opml"
        ? exportProjectToOpml(project)
        : exportProjectToMarkdown(project);
}

async function doImport() {
    if (!project) {
        console.log("doImport: No project available");
        return;
    }

    console.log("doImport: Starting import process");
    console.log("doImport: Import format:", importFormat);
    console.log("doImport: Import text:", importText);
    console.log("doImport: Project before import:", project);
    console.log("doImport: Project items before import:", project.items?.length || 0);

    if (importFormat === "opml") {
        console.log("doImport: Calling importOpmlIntoProject");
        importOpmlIntoProject(importText, project);
    }
    else {
        console.log("doImport: Calling importMarkdownIntoProject");
        importMarkdownIntoProject(importText, project);
    }

    console.log("doImport: Project items after import:", project.items?.length || 0);
    if (project.items && project.items.length > 0) {
        console.log("doImport: First page after import:", project.items[0].text);
    }

    // インポート後にYjsに手動で同期（フェーズ1: 併存システム）
    console.log("doImport: Syncing imported data to Yjs...");
    try {
        // YjsProjectManagerを取得
        const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
        if (yjsProjectManager) {
            // プロジェクトタイトルを同期
            const projectTitle = project.title;
            console.log(`doImport: Syncing project title to Yjs: "${projectTitle}"`);
            yjsProjectManager.updateProjectTitle(projectTitle);

            // インポート処理：Fluidと同様にYjsでも全ページを削除してから新しいページを作成
            console.log(`doImport: Project has ${project.items.length} root items (pages)`);

            // まず、Yjsの全ページを削除（Fluidのimportと同様の処理）
            console.log("doImport: Clearing all existing Yjs pages before import...");
            try {
                const existingPages = yjsProjectManager.getPages();
                console.log(`doImport: Found ${existingPages.length} existing Yjs pages to remove`);
                for (const existingPage of existingPages) {
                    if (!existingPage.deleted) {
                        console.log(`doImport: Removing existing Yjs page "${existingPage.title}" (ID: ${existingPage.id})`);
                        yjsProjectManager.deletePage(existingPage.id);
                    }
                }
                console.log("doImport: All existing Yjs pages removed");
            } catch (error) {
                console.error("doImport: Error removing existing Yjs pages:", error);
            }

            // 新しいページを作成
            for (const pageItem of project.items) {
                const pageTitle = pageItem.text;
                console.log(`doImport: Creating new Yjs page "${pageTitle}"...`);

                // 新しいページを作成
                const newPageId = await yjsProjectManager.createPage(pageTitle, "import");
                console.log(`doImport: Created Yjs page "${pageTitle}" with ID: ${newPageId}`);

                // ページのアイテムをYjsに同期
                const yjsPageManager = yjsProjectManager.getPageManager(newPageId);
                if (yjsPageManager) {
                    // Fluidのアイテムを再帰的にYjsに追加
                    const syncItemsRecursively = (fluidItems: any, parentId?: string) => {
                        for (const fluidItem of fluidItems) {
                            try {
                                const yjsItemId = yjsPageManager.insertItem(
                                    fluidItem.text,
                                    "import",
                                    parentId
                                );
                                console.log(`doImport: Added item "${fluidItem.text}" to Yjs with ID: ${yjsItemId}`);

                                // 子アイテムがある場合は再帰的に処理
                                if (fluidItem.items && fluidItem.items.length > 0) {
                                    syncItemsRecursively(fluidItem.items, yjsItemId);
                                }
                            } catch (error) {
                                console.error(`doImport: Error adding item "${fluidItem.text}" to Yjs:`, error);
                            }
                        }
                    };

                    syncItemsRecursively(pageItem.items);
                    console.log(`doImport: Completed syncing page "${pageTitle}" to Yjs`);
                } else {
                    console.error(`doImport: Could not get Yjs page manager for "${pageTitle}"`);
                }
            }
            console.log("doImport: Yjs sync completed successfully");
        } else {
            console.warn("doImport: YjsProjectManager not available, skipping Yjs sync");
        }
    } catch (error) {
        console.error("doImport: Error syncing to Yjs:", error);
    }

    // Reinitialize global store so new pages become accessible
    console.log("doImport: Reinitializing global store");
    store.project = project;

    // store.projectを設定することで、store.pagesも自動的に更新される
    console.log("doImport: Waiting for store.pages to be updated...");

    // store.pagesが更新されるまで少し待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    if (store.pages) {
        console.log(`doImport: store.pages updated with ${store.pages.current.length} pages`);

        // デバッグ用：更新されたページ一覧をログ出力
        for (let i = 0; i < store.pages.current.length; i++) {
            const page = store.pages.current[i];
            console.log(`doImport: Page ${i}: "${page.text}" (id: ${page.id})`);
        }
    } else {
        console.error("doImport: store.pages is still null after project update");
    }

    // Clear import text after successful import
    importText = "";

    console.log("doImport: Import completed, navigating to first imported page");

    // Navigate to the first imported page instead of reloading
    if (project.items && project.items.length > 0) {
        const firstPage = project.items[0];
        const projectName = $page.params.project;
        const pageName = firstPage.text;
        console.log(`doImport: Navigating to /${projectName}/${pageName}`);

        // ナビゲーション前に少し待機してstore.pagesの更新が確実に反映されるようにする
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            await goto(`/${projectName}/${pageName}`);
            console.log("doImport: Navigation completed successfully");
        } catch (error) {
            console.error("doImport: Navigation failed:", error);
        }

        // ナビゲーション後にstore.currentPageを強制的に更新
        console.log("doImport: Forcing currentPage update after navigation...");
        await new Promise(resolve => setTimeout(resolve, 500));

        // 正しいページを検索してstore.currentPageに設定
        if (store.pages) {
            const targetPage = store.pages.current.find((p: any) => p.text === pageName);
            if (targetPage) {
                console.log(`doImport: Found target page "${targetPage.text}" (id: ${targetPage.id})`);

                // 現在のcurrentPageをログ出力
                console.log(`doImport: Current store.currentPage: "${store.currentPage?.text}" (id: ${store.currentPage?.id})`);

                // 強制的にcurrentPageを設定
                store.currentPage = targetPage;
                console.log(`doImport: Set currentPage to "${targetPage.text}" (id: ${targetPage.id})`);

                // 設定後の確認
                await new Promise(resolve => setTimeout(resolve, 100));
                console.log(`doImport: After setting - store.currentPage: "${store.currentPage?.text}" (id: ${store.currentPage?.id})`);

                // さらに強制的に再設定（他の処理による上書きを防ぐため）
                if (store.currentPage?.id !== targetPage.id) {
                    console.log("doImport: currentPage was overwritten, forcing reset...");
                    store.currentPage = targetPage;
                    console.log(`doImport: Force reset - store.currentPage: "${store.currentPage?.text}" (id: ${store.currentPage?.id})`);
                }
            } else {
                console.error(`doImport: Could not find page "${pageName}" in store.pages`);
                console.log("doImport: Available pages:");
                for (let i = 0; i < store.pages.current.length; i++) {
                    const p = store.pages.current[i] as any;
                    console.log(`  Page ${i}: "${p.text}" (id: ${p.id})`);
                }
            }
        } else {
            console.error("doImport: store.pages is null after navigation");
        }
    }
    else {
        console.log("doImport: No pages found after import");
    }
}
</script>

<h2>Import / Export</h2>
<div class="export-section">
    <button on:click={() => doExport("opml")}>Export OPML</button>
    <button on:click={() => doExport("markdown")}>Export Markdown</button>
    <textarea readonly bind:value={exportText} data-testid="export-output"></textarea>
</div>
<div class="import-section">
    <select bind:value={importFormat} data-testid="import-format-select">
        <option value="opml">OPML</option>
        <option value="markdown">Markdown</option>
    </select>
    <textarea bind:value={importText} data-testid="import-input"></textarea>
    <button on:click={doImport}>Import</button>
</div>
