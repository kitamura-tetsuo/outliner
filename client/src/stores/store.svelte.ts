import type { Item, Items, Project } from "../schema/app-schema";
import { TreeSubscriber } from "./TreeSubscriber";

class GeneralStore {
    pages = $state<TreeSubscriber<Items>>();
    currentPage = $state<Item>();
    private _project = $state<Project>();

    public get project(): Project | undefined {
        return this._project;
    }
    public set project(v: Project) {
        if (import.meta.env.DEV) {
            console.log(`store: Setting project`, { projectExists: !!v, projectTitle: v?.title });
        }
        this._project = v;
        if (import.meta.env.DEV) {
            console.log(`store: Creating TreeSubscriber for pages`);
        }
        this.pages = new TreeSubscriber<Items>(v.items as Items, "nodeChanged");
        if (import.meta.env.DEV) {
            console.log(`store: TreeSubscriber created`, {
                pagesExists: !!this.pages,
                pagesLength: this.pages?.current?.length,
            });
        }
        if (this.pages?.current?.length > 0) {
            this.currentPage = this.pages.current[0];
            if (import.meta.env.DEV) {
                console.log(`store: Set currentPage to first page`, {
                    currentPageExists: !!this.currentPage,
                    currentPageText: this.currentPage?.text,
                });
            }
        } else {
            if (import.meta.env.DEV) {
                console.log(`store: No pages available, currentPage not set`);
            }
        }
    }
}

export const store = new GeneralStore();

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== "undefined") {
    (window as any).appStore = store;
    (window as any).generalStore = store; // TestHelpersとの互換性のため
}
