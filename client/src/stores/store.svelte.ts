// @ts-nocheck
import type { Item, Items, Project } from "@common/schema/app-schema";
import { TreeSubscriber } from "./TreeSubscriber";

class GeneralStore {
    pages = $state<TreeSubscriber<Items>>();
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
        console.log(`store: Creating TreeSubscriber for pages`);

        this.pages = new TreeSubscriber<Items>(v.items as Items, "nodeChanged");
        console.log(`store: TreeSubscriber created`, {
            pagesExists: !!this.pages,
            pagesLength: this.pages?.current?.length,
        });
    }
}

export const store = new GeneralStore();

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== "undefined") {
    (window as any).appStore = store;
    (window as any).generalStore = store; // TestHelpersとの互換性のため
}
