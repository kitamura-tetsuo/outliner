import type { Item, Items, Project } from "../schema/app-schema";
import { YjsSubscriber } from "./YjsSubscriber";

class GeneralStore {
    pages = $state<YjsSubscriber<Items>>();
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
}
