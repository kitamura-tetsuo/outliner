/**
 * Fluid/Yjsモード切り替えのためのユーティリティ関数
 */

export type OutlinerMode = "fluid" | "yjs";

/**
 * 現在のアウトライナーモードを取得
 * @returns 現在のモード（デフォルト: "fluid"）
 */
export function getCurrentMode(): OutlinerMode {
    if (typeof window === "undefined") {
        return "fluid"; // サーバーサイドではFluidモード
    }

    const mode = localStorage.getItem("OUTLINER_MODE");
    return (mode === "yjs") ? "yjs" : "fluid";
}

/**
 * Yjsモードかどうかを判定
 * @returns Yjsモードの場合true
 */
export function isYjsMode(): boolean {
    return getCurrentMode() === "yjs";
}

/**
 * Fluidモードかどうかを判定
 * @returns Fluidモードの場合true
 */
export function isFluidMode(): boolean {
    return getCurrentMode() === "fluid";
}

/**
 * モードを設定
 * @param mode 設定するモード
 */
export function setMode(mode: OutlinerMode): void {
    if (typeof window !== "undefined") {
        localStorage.setItem("OUTLINER_MODE", mode);
    }
}

/**
 * Yjsモードの場合のみ実行する関数
 * @param fn 実行する関数
 */
export async function executeInYjsMode<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (isYjsMode()) {
        return await fn();
    }
    return undefined;
}

/**
 * Fluidモードの場合のみ実行する関数
 * @param fn 実行する関数
 */
export async function executeInFluidMode<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (isFluidMode()) {
        return await fn();
    }
    return undefined;
}

/**
 * 同期版：Yjsモードの場合のみ実行する関数
 * @param fn 実行する関数
 */
export function executeInYjsModeSync<T>(fn: () => T): T | undefined {
    if (isYjsMode()) {
        return fn();
    }
    return undefined;
}

/**
 * 同期版：Fluidモードの場合のみ実行する関数
 * @param fn 実行する関数
 */
export function executeInFluidModeSync<T>(fn: () => T): T | undefined {
    if (isFluidMode()) {
        return fn();
    }
    return undefined;
}
