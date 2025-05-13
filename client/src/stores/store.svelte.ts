import type {
    Item,
    Items,
    Project,
} from "../schema/app-schema";
import { TreeSubscriber } from "./TreeSubscriber";

class GeneralStore {
    pages = $state<TreeSubscriber<Items>>();
    currentPage = $state<Item>();
    private _project = $state<Project>();

    public get project(): Project | undefined {
        return this._project;
    }
    public set project(v: Project) {
        this._project = v;
        this.pages = new TreeSubscriber<Items>(v.items as Items, "nodeChanged");
        this.currentPage = this.pages.current[0];
    }
}

export const store = new GeneralStore();

// グローバルに参照できるようにする（ScrapboxFormatter.tsからアクセスするため）
if (typeof window !== 'undefined') {
    (window as any).appStore = store;
}
