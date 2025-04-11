// 変更監視用のカスタムストア
// このストアは、Svelteの$stateを使用して、変更を監視するためのカスタムストアを作成します。

export function createSubscribableState<T>() {
    let current = $state<T>();
    const callbacks = new Set<(v: T) => void>();

    return {
        subscribe(callback: (v: T) => void) {
            callbacks.add(callback);
            if (current) {
                callback(current);
            }
            return () => {
                callbacks.delete(callback);
            };
        },
        set(v: T) {
            current = v;
            callbacks.forEach(callback => callback(v));
        },
        get current() {
            return current;
        },
    };
}

// 使用例
// private readonly _projectStore = createSubscribableState<Project>();
// public get project(): Project | undefined {
//     return this._projectStore.current;
// }
// public set project(v: Project) {
//     this._projectStore.set(v);
//     this.pages = new TreeSubscriber<Items>(v.items as Items, "nodeChanged");
//     this.currentPage = this.pages.current[0];
// }
// public subscribeProject(callback: (v: Project) => void) {
//     return this._projectStore.subscribe(callback);
// }
