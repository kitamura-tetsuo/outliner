import { createSubscriber, SvelteSet } from "svelte/reactivity";
import * as Y from "yjs";
import { saveProjectSnapshot } from "../lib/projectSnapshot";
import type { Item, Items } from "../schema/app-schema";
import { Project } from "../schema/app-schema";

export class GeneralStore {
    // Use $state for pages to ensure proper Svelte reactivity
    private _pagesData = $state<{ items: Items | undefined; }>({ items: undefined });
    // Getter for pages.current that tracks reactivity - set in constructor for proper closure
    pages!: { current: Items | undefined; };
    private _currentPage: Item | undefined;
    private readonly _currentPageSubscribers = new SvelteSet<() => void>();

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.pages = {
            get current(): Items | undefined {
                return self._pagesData.items;
            },
        };
    }
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
                let next: Item | undefined;
                const len = items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = items.at(i);
                    if (!p) continue;
                    const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                    if (String(t).toLowerCase() === String(title).toLowerCase()) {
                        next = p;
                        break;
                    }
                }
                // REMOVED: Legacy browser-based auto-creation. Tests should use TestHelpers.createAndSeedProject for data seeding.
                // If page doesn't exist, do not auto-create it here - let tests fail if seeding was missed.

                // 子行の移植（先行シードを反映）
                // DISABLED: Legacy browser-based auto-creation logic causes duplication in E2E tests
                // with server-side seeding. Tests should rely on SeedClient and proper Yjs sync.
                /*
                try {
                    const prevItems = page?.items;
                    const nextItems = next?.items;
                    const prevLen = prevItems?.length ?? 0;
                    const nextLen = nextItems?.length ?? 0;
                    if (prevLen > 0) {
                        const isPlaceholderChild = (node: ItemLike | PlainItemData | null | undefined) => {
                            const text = node?.text?.toString?.() ?? String(node?.text ?? "");
                            if (!text) return true;
                            return text === "一行目: テスト" || text === "二行目: Yjs 反映"
                                || text === "三行目: 並び順チェック";
                        };
                        const shouldReplaceChildren = nextLen === 0
                            || (nextLen <= 3 && (() => {
                                for (let idx = 0; idx < nextLen; idx++) {
                                    const candidate = nextItems?.at ? nextItems.at(idx) : undefined;
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

                            const cloneBranch = (source: Items | undefined, target: Items | undefined) => {
                                if (!source || !target) return;
                                const length = source.length ?? 0;
                                for (let index = 0; index < length; index++) {
                                    const from = source.at(index);
                                    if (!from) continue;
                                    const text = from?.text?.toString?.() ?? String(from?.text ?? "");
                                    const created = target.addNode?.("tester");
                                    if (!created) continue;
                                    created.updateText?.(text);
                                    cloneBranch(from.items, created.items);
                                }
                            };
                            cloneBranch(prevItems, nextItems);
                        }
                    }
                } catch {
                    // Ignore errors during child item migration
                }
                */
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
    // Explicit signal for pages updates to ensure Svelte 5 reactivity
    pagesVersion = $state(0);

    public set project(v: Project) {
        if (v === this._project) {
            return;
        }

        this._project = v;

        saveProjectSnapshot(v);

        // Yjs observeDeep でルートツリーを監視し、Svelteの購読にブリッジ
        const project = v;
        const ymap = project?.ydoc?.getMap?.("orderedTree");

        // Setup observer immediately on the project itself
        const handler = (_events: Array<Y.YEvent<Y.AbstractType<unknown>>>, _tr?: Y.Transaction) => { // eslint-disable-line @typescript-eslint/no-unused-vars
            try {
                saveProjectSnapshot(project);
            } catch {
                // Ignore errors during snapshot saving
            }
            this.pagesVersion++; // Trigger signal
        };

        // Monitor both the orderedTree (content) and items (page list) for changes
        try {
            ymap?.observeDeep?.(handler);
            (project?.items as any)?.observeDeep?.(handler);
        } catch {
            // Ignore errors during observation setup
        }

        // Update the $state for pages to trigger Svelte reactivity
        this._pagesData.items = project.items;
    }
}

export const store = $state(new GeneralStore());

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== "undefined") {
    (window as unknown as { appStore: GeneralStore; }).appStore = store;
    (window as unknown as { generalStore: GeneralStore; }).generalStore = store; // TestHelpersとの互換性のため

    // 起動直後に仮プロジェクトを用意（本接続が来れば yjsStore が置換）
    // This ensures tests and direct navigation work even before Yjs connection is established
    try {
        if (!store.project) {
            const parts = window.location.pathname.split("/").filter(Boolean);
            const title = decodeURIComponent(parts[0] || "Untitled Project");
            (store as { project: Project; }).project = Project.createInstance(title);
            console.log("INIT: Provisional Project set in store.svelte.ts", { title });
        }
    } catch {
        // Ignore errors during initial project setup
    }
}

// NOTE: Projects are now created via HTTP seeding (SeedClient) for E2E tests,
// and loaded via loadProjectAndPage in +page.svelte for proper synchronization.
