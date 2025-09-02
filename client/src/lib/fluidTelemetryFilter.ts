/*
 * DISABLED: Fluid Framework Telemetry Filter
 *
 * このファイルはFluid Framework専用のため、Yjsモードでは無効化されています。
 */

// import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { getLogger } from "./logger";

// 型のスタブ（Yjsモード用に最低限の型を定義してビルドを通す）
// Fluid依存を避けるため any で代用
export type ConfigTypes = any;
export interface IConfigProviderBase {
    getRawConfig: (name: string) => any;
}

// 環境変数からtelemetry無効化設定を取得（Yjsモードでは常にfalse）
const disableTelemetry = false;

// APIサーバーのURLを取得
const API_URL = import.meta.env.VITE_API_SERVER_URL || "http://localhost:7071";

/**
 * フィルタされたtelemetryログをサーバーに送信する関数
 * @param level ログレベル
 * @param args ログの引数
 */
function sendFilteredTelemetryLog(level: string, ...args: any[]): void {
    try {
        // ログデータを作成
        const logData = {
            level,
            log: args,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            isTelemetry: true, // telemetryログであることを示すフラグ
        };

        // サーバーにログを送信
        fetch(`${API_URL}/api/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(logData),
            credentials: "omit",
            mode: "cors",
        }).catch(err => {
            // 送信エラー時の処理（サイレント）
            console.debug("Telemetryログ送信エラー:", err);
        });
    } catch (error) {
        // エラーは無視（ログ送信のエラーでアプリを止めない）
    }
}

// コンソールのオリジナルメソッドを保存
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
};

// telemetryログをフィルタリングするためのコンソールオーバーライド
if (disableTelemetry && typeof window !== "undefined") {
    // コンソールメソッドをオーバーライド
    console.log = function(...args: any[]) {
        if (shouldFilterTelemetryLog(args)) {
            // フィルタされたログをサーバーに送信
            sendFilteredTelemetryLog("info", ...args);
            return;
        }
        originalConsole.log.apply(console, args);
    };

    console.info = function(...args: any[]) {
        if (shouldFilterTelemetryLog(args)) {
            sendFilteredTelemetryLog("info", ...args);
            return;
        }
        originalConsole.info.apply(console, args);
    };

    console.warn = function(...args: any[]) {
        if (shouldFilterTelemetryLog(args)) {
            sendFilteredTelemetryLog("warn", ...args);
            return;
        }
        originalConsole.warn.apply(console, args);
    };

    console.error = function(...args: any[]) {
        if (shouldFilterTelemetryLog(args)) {
            sendFilteredTelemetryLog("error", ...args);
            return;
        }
        originalConsole.error.apply(console, args);
    };

    console.debug = function(...args: any[]) {
        if (shouldFilterTelemetryLog(args)) {
            sendFilteredTelemetryLog("debug", ...args);
            return;
        }
        originalConsole.debug.apply(console, args);
    };
}

// telemetryログかどうかを判定する関数
function shouldFilterTelemetryLog(args: any[]): boolean {
    if (args.length === 0) return false;

    const telemetryKeywords = [
        "fluid:telemetry:",
        "fluid-framework",
        "SharedTree",
        "ContainerRuntime",
        "DataStore",
        "DeltaManager",
        "OpProcessingController",
        "FluidDataStoreRuntime",
        "FluidDataStoreContext",
        "SharedObject",
        "SharedMap",
        "SharedDirectory",
        "SharedString",
        "SharedCell",
        "SharedCounter",
        "SharedSequence",
        "SummaryCollection",
        "SummaryUploader",
        "ContainerContext",
        "ContainerLoader",
        "DocumentLoadError",
        "ConnectionState",
        "AzureClient",
        "TinyliciousClient",
        "ContainerClose",
        "ContainerOpen",
        "ContainerLoad",
        "ContainerAttach",
        "ContainerConnect",
        "ContainerDisconnect",
        "SummaryUpload",
        "SummaryGeneration",
        "dataProcessingError",
        "errorInstanceId",
        "containerAttachState",
        "containerLifecycleState",
        "containerConnectionState",
    ];

    // 最初の引数が文字列の場合
    if (typeof args[0] === "string") {
        return telemetryKeywords.some(keyword => args[0].includes(keyword));
    }

    // 最初の引数がオブジェクトの場合
    if (typeof args[0] === "object" && args[0] !== null) {
        // オブジェクトの各プロパティを検索
        const objStr = JSON.stringify(args[0]);
        return telemetryKeywords.some(keyword => objStr.includes(keyword));
    }

    return false;
}

/**
 * Fluid Frameworkのtelemetryログをフィルタリングするためのカスタムロガー
 * telemetryイベントを無視するロガーラッパー
 */
export class TelemetryFilterLogger {
    private baseLogger: any;
    private readonly telemetryKeywords = [
        "fluid:telemetry:",
        "fluid-framework",
        "SharedTree",
        "ContainerRuntime",
        "DataStore",
        "DeltaManager",
        "OpProcessingController",
        "FluidDataStoreRuntime",
        "FluidDataStoreContext",
        "SharedObject",
        "SharedMap",
        "SharedDirectory",
        "SharedString",
        "SharedCell",
        "SharedCounter",
        "SharedSequence",
        "SummaryCollection",
        "SummaryUploader",
        "ContainerContext",
        "ContainerLoader",
        "DocumentLoadError",
        "ConnectionState",
        "AzureClient",
        "TinyliciousClient",
        "ContainerClose",
        "ContainerOpen",
        "ContainerLoad",
        "ContainerAttach",
        "ContainerConnect",
        "ContainerDisconnect",
        "SummaryUpload",
        "SummaryGeneration",
        "dataProcessingError",
        "errorInstanceId",
        "containerAttachState",
        "containerLifecycleState",
        "containerConnectionState",
    ];

    constructor(componentName: string = "FluidTelemetry") {
        this.baseLogger = getLogger(componentName, false);
    }

    /**
     * ログメッセージがtelemetry関連かどうかを判定
     */
    private isTelemetryLog(message: string): boolean {
        // 環境変数でtelemetryが無効化されていない場合は通常通り処理
        if (!disableTelemetry) return false;

        if (!message) return false;

        return this.telemetryKeywords.some(keyword => typeof message === "string" && message.includes(keyword));
    }

    /**
     * エラーオブジェクトがtelemetry関連かどうかを判定
     */
    private isTelemetryError(error: any): boolean {
        if (!disableTelemetry || !error) return false;

        // エラーオブジェクトをJSON文字列に変換して検索
        try {
            const errorStr = JSON.stringify(error);
            return this.telemetryKeywords.some(keyword => errorStr.includes(keyword));
        } catch (e) {
            // JSON変換に失敗した場合はスタックトレースを検索
            if (error.stack) {
                return this.telemetryKeywords.some(keyword => error.stack.includes(keyword));
            }
            return false;
        }
    }

    /**
     * ログメソッドをラップしてtelemetryログをフィルタリング
     */
    send(level: string, ...args: any[]): void {
        // 環境変数でtelemetryが無効化されていない場合は通常通り処理
        if (!disableTelemetry) {
            if (this.baseLogger[level]) {
                this.baseLogger[level](...args);
            }
            return;
        }

        // 引数がない場合は通常通り処理
        if (args.length === 0) {
            if (this.baseLogger[level]) {
                this.baseLogger[level](...args);
            }
            return;
        }

        // 最初の引数がメッセージの場合
        if (typeof args[0] === "string" && this.isTelemetryLog(args[0])) {
            // telemetryログをサーバーに送信して、ローカルでは無視
            sendFilteredTelemetryLog(level, ...args);
            return;
        }

        // オブジェクトの場合はeventプロパティをチェック
        if (typeof args[0] === "object" && args[0] !== null) {
            // eventプロパティをチェック
            const eventName = args[0].event || args[0].eventName;
            if (eventName && this.isTelemetryLog(eventName)) {
                // telemetryイベントをサーバーに送信して、ローカルでは無視
                sendFilteredTelemetryLog(level, ...args);
                return;
            }

            // エラーオブジェクトをチェック
            if (args[0] instanceof Error || this.isTelemetryError(args[0])) {
                // telemetryエラーをサーバーに送信して、ローカルでは無視
                sendFilteredTelemetryLog(level, ...args);
                return;
            }

            // オブジェクトをJSON文字列に変換して検索
            try {
                const objStr = JSON.stringify(args[0]);
                if (this.telemetryKeywords.some(keyword => objStr.includes(keyword))) {
                    // telemetryキーワードを含むオブジェクトをサーバーに送信して、ローカルでは無視
                    sendFilteredTelemetryLog(level, ...args);
                    return;
                }
            } catch (e) {
                // JSON変換に失敗した場合は通常通り処理
            }
        }

        // telemetry以外のログは通常通り処理
        if (this.baseLogger[level]) {
            this.baseLogger[level](...args);
        }
    }

    // 標準的なログレベルメソッドを実装
    trace(...args: any[]): void {
        this.send("trace", ...args);
    }
    debug(...args: any[]): void {
        this.send("debug", ...args);
    }
    info(...args: any[]): void {
        this.send("info", ...args);
    }
    warn(...args: any[]): void {
        this.send("warn", ...args);
    }
    error(...args: any[]): void {
        this.send("error", ...args);
    }
    fatal(...args: any[]): void {
        this.send("fatal", ...args);
    }
}

/**
 * Fluid Frameworkの実験的機能を無効化するための設定プロバイダー
 */
export function createFluidConfigProvider(): IConfigProviderBase {
    // telemetryを無効化する設定
    const featureGates: Record<string, ConfigTypes> = {
        // telemetry関連の機能を無効化（環境変数に基づいて設定）
        "Fluid.Container.EnableTelemetry": !disableTelemetry,
        "Fluid.Driver.EnableTelemetry": !disableTelemetry,
        "Fluid.ContainerRuntime.EnableTelemetry": !disableTelemetry,
        "Fluid.DataStore.EnableTelemetry": !disableTelemetry,
        "Fluid.SharedTree.EnableTelemetry": !disableTelemetry,
        "Fluid.DeltaManager.EnableTelemetry": !disableTelemetry,
        "Fluid.OpProcessingController.EnableTelemetry": !disableTelemetry,
    };

    return {
        getRawConfig: (name: string): ConfigTypes => featureGates[name],
    };
}

/**
 * Fluid Frameworkのtelemetryを無効化するためのロガーを取得
 */
export function getTelemetryFilterLogger(): any {
    return new TelemetryFilterLogger();
}
