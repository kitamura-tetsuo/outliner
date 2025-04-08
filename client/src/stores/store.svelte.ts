import type {
    Items,
    Project,
} from "../schema/app-schema";
import { TreeSubscriber } from "./TreeSubscriber";

class GeneralStore {
    pages = $state<TreeSubscriber<Items>>();

    private _project = $state<Project>();
    public get project(): Project | undefined {
        return this._project;
    }
    public set project(v: Project) {
        this._project = v;
        this.pages = new TreeSubscriber<Items>(v.items as Items, "nodeChanged");
    }
}
export const store = new GeneralStore();
