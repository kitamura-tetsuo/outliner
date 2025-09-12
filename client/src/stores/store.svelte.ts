import type { Item, Items } from "../schema/app-schema";
import { Project } from "../schema/app-schema";
import { YjsSubscriber } from "./YjsSubscriber";

class GeneralStore {
    // 初期はプレースホルダー（tests: truthy 判定を満たし、後で置換される）
    pages = $state<any>({ current: [] });
    currentPage = $state<Item>();
    private _project = $state<Project>();

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
        console.log(`store: Creating YjsSubscriber for pages`);

        // Wrap Items for reactive consumption via YjsSubscriber
        const items = v.items as Items;
        this.pages = {
            get current() {
                return items;
            },
            set current(_val: any) {/* no-op */},
        } as unknown as YjsSubscriber<Items>;
    }
}

export const store = new GeneralStore();

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== "undefined") {
    (window as any).appStore = store;
    (window as any).generalStore = store; // TestHelpersとの互換性のため

    // 起動直後に仮プロジェクトを用意（本接続が来れば yjsStore が置換）
    try {
        if (!store.project) {
            const parts = window.location.pathname.split("/").filter(Boolean);
            const title = decodeURIComponent(parts[0] || "Untitled Project");
            (store as any).project = (Project as any).createInstance(title);
            console.log("INIT: Provisional Project set in store.svelte.ts", { title });
        }
    } catch {}
}
