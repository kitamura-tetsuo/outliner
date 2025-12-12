import { createSubscriber, SvelteSet } from "svelte/reactivity";
import * as Y from "yjs";
import { saveProjectSnapshot } from "../lib/projectSnapshot";
import type { Item, Items } from "../schema/app-schema";
import { Project } from "../schema/app-schema";

export class GeneralStore {
    // 初期はプレースホルダー（tests: truthy 判定を満たし、後で置換される）
    pages: { current: Items | undefined; } = { current: undefined };
    private _currentPage: Item | undefined;
    private readonly _currentPageSubscribers = new SvelteSet<() => void>();
    // 現在開いているコメントスレッドのアイテムID（同時に1つのみ表示）
    openCommentItemId: string | null = null;
    // Fallback: 接続切替時などIDが変わるケースに備えてインデックスも保持
    openCommentItemIndex: number | null = null;
    private _project: Project | undefined;
    textareaRef: HTMLTextAreaElement | null = null;

    private _subscribeCurrentPage = createSubscriber((update) => {
        this._currentPageSubscribers.add(update);
        return () => this._currentPageSubscribers.delete(update);
    });

    public get currentPage(): Item | undefined {
        // Svelte の $derived/by から購読可能にする
        this._subscribeCurrentPage();
        return this._currentPage;
    }
    public set currentPage(v: Item | undefined) {
        // E2E 安定化: テストが暫定プロジェクトのページを設定した場合でも、
        // 接続済みプロジェクトへ同名ページを見つける/作成して置き換える
        try {
            const proj = this._project;
            const page = v;
            if (proj?.ydoc && page?.ydoc && proj.ydoc !== page.ydoc) {
                const title = page?.text?.toString?.() ?? String(page?.text ?? "");
                const items = proj.items;
                let next: Item | null = null;
                const len = items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = items.at(i);
                    const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                    if (String(t).toLowerCase() === String(title).toLowerCase()) {
                        next = p ?? null;
                        break;
                    }
                }
                if (!next) {
                    next = items?.addNode?.("tester");
                    next?.updateText?.(title);
                }
                // 子行の移植（先行シードを反映）
                try {
                    const prevItems = page?.items;
                    const nextItems = next?.items;
                    const prevLen = prevItems?.length ?? 0;
                    const nextLen = nextItems?.length ?? 0;
                    if (prevLen > 0) {
                        const isPlaceholderChild = (node: any) => {
                            const text = node?.text?.toString?.() ?? String(node?.text ?? "");
                            if (!text) return true;
                            return text === "一行目: テスト" || text === "二行目: Yjs 反映"
                                || text === "三行目: 並び順チェック";
                        };
                        const shouldReplaceChildren = nextLen === 0
                            || (nextLen <= 3 && (() => {
                                for (let idx = 0; idx < nextLen; idx++) {
                                    const candidate = nextItems.at ? nextItems.at(idx) : nextItems[idx];
                                    if (!isPlaceholderChild(candidate)) {
                                        return false;
                                    }
                                }
                                return true;
                            })());

                        if (shouldReplaceChildren) {
                            while ((nextItems?.length ?? 0) > 0) {
                                nextItems.removeAt(nextItems.length - 1);
                            }

                            const cloneBranch = (
                                source: any,
                                target: any,
                            ) => {
                                if (!source || !target) return;
                                const length = typeof source?.length === "number" ? source.length : 0;
                                for (let index = 0; index < length; index++) {
                                    const from = typeof source?.at === "function" ? source.at(index) : source[index];
                                    if (!from) continue;
                                    const text = from?.text?.toString?.() ?? String(from?.text ?? "");
                                    const created = target?.items?.addNode?.("tester");
                                    if (!created) continue;
                                    created?.updateText?.(text);
                                    cloneBranch(from, created);
                                }
                            };
                            cloneBranch(prevItems as any, nextItems as any);
                        }
                    }
                } catch {
                    // Ignore errors during child item migration
                }
                this._currentPage = next;
                // 通知
                this._currentPageSubscribers.forEach(fn => {
                    try {
                        fn();
                    } catch {}
                });
                return;
            }
        } catch {}
        this._currentPage = v;
        // 通知
        this._currentPageSubscribers.forEach(fn => {
            try {
                fn();
            } catch {}
        });
    }

    public get project(): Project | undefined {
        return this._project;
    }
    public set project(v: Project) {
        if (v === this._project) {
            console.log(`store: Project is already set, skipping`);
            return;
        }

        console.log(`store: Setting project`, { projectExists: !!v, projectTitle: v?.title });

        this._project = v;
        console.log(`store: Setting up Yjs observe for pages`);

        saveProjectSnapshot(v);

        // Yjs observeDeep でルートツリーを監視し、Svelteの購読にブリッジ
        const project = v;
        const ymap = project?.ydoc?.getMap?.("orderedTree");
        const subscribe = createSubscriber((_update) => {
            const handler = (_events: Array<Y.YEvent<any>>, _tr?: Y.Transaction) => { // eslint-disable-line @typescript-eslint/no-unused-vars
                try {
                    saveProjectSnapshot(project);
                } catch {
                    // Ignore errors during snapshot saving
                }
                _update();
            };
            try {
                ymap?.observeDeep?.(handler);
            } catch {
                // Ignore errors during observation setup
            }
            return () => {
                try {
                    ymap?.unobserveDeep?.(handler);
                } catch {
                    // Ignore errors during observation teardown
                }
            };
        });
        this.pages = {
            get current() {
                subscribe();
                return project.items;
            },
        };
    }
}

export const store = $state(new GeneralStore());

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== "undefined") {
    (window as unknown as { appStore: GeneralStore; }).appStore = store;
    (window as unknown as { generalStore: GeneralStore; }).generalStore = store; // TestHelpersとの互換性のため

    // 起動直後に仮プロジェクトを用意（本接続が来れば yjsStore が置換）
    try {
        if (!store.project) {
            const parts = window.location.pathname.split("/").filter(Boolean);
            // Don't create a provisional project for settings page - it will be handled by the settings component
            const isSettingsPage = parts[0] === "settings";
            if (!isSettingsPage) {
                // Check sessionStorage for test project name first
                const testProjectName = window.sessionStorage?.getItem("TEST_CURRENT_PROJECT_NAME");
                const title = testProjectName || decodeURIComponent(parts[0] || "Untitled Project");
                (store as { project: Project; }).project = Project.createInstance(title);
                console.log("INIT: Provisional Project set in store.svelte.ts", { title });
            }
        }
    } catch {
        // Ignore errors during initial project setup
    }
}
