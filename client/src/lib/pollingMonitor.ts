/**
 * ポーリングモニター
 *
 * ブラウザ内でsetInterval/setTimeoutをインターセプトし、
 * 各ポーリングの実行状況を追跡します。
 *
 * テスト環境で使用して、不要なポーリングを特定できます。
 */

export interface PollingCall {
    id: number;
    type: "setInterval" | "setTimeout" | "requestAnimationFrame";
    delay?: number;
    stack: string;
    createdAt: number;
    executionCount: number;
    lastExecutedAt?: number;
    disabled: boolean;
}

export interface PollingStats {
    totalCalls: number;
    activeCalls: number;
    disabledCalls: number;
    calls: Map<number, PollingCall>;
}

class PollingMonitor {
    private calls: Map<number, PollingCall> = new Map();
    private nextId = 1;
    private enabled = false;

    // オリジナルの関数を保存
    private originalSetInterval: typeof setInterval;
    private originalSetTimeout: typeof setTimeout;
    private originalClearInterval: typeof clearInterval;
    private originalClearTimeout: typeof clearTimeout;
    private originalRequestAnimationFrame: typeof requestAnimationFrame;
    private originalCancelAnimationFrame: typeof cancelAnimationFrame;

    // 無効化するポーリングのパターン
    private disablePatterns: RegExp[] = [];

    constructor() {
        this.originalSetInterval = window.setInterval.bind(window);
        this.originalSetTimeout = window.setTimeout.bind(window);
        this.originalClearInterval = window.clearInterval.bind(window);
        this.originalClearTimeout = window.clearTimeout.bind(window);
        this.originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
        this.originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    }

    /**
     * モニタリングを開始
     */
    start() {
        if (this.enabled) return;
        this.enabled = true;

        const self = this;

        // setIntervalをインターセプト
        window.setInterval = function(callback: any, delay?: number, ...args: any[]): any {
            const stack = new Error().stack || "";
            const id = self.nextId++;

            const call: PollingCall = {
                id,
                type: "setInterval",
                delay,
                stack,
                createdAt: Date.now(),
                executionCount: 0,
                disabled: self.shouldDisable(stack),
            };

            self.calls.set(id, call);

            if (call.disabled) {
                console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                // ダミーのIDを返す
                return id;
            }

            // ラップされたコールバック
            const wrappedCallback = function(...callbackArgs: any[]) {
                call.executionCount++;
                call.lastExecutedAt = Date.now();
                return callback.apply(this, callbackArgs);
            };

            const timerId = self.originalSetInterval(wrappedCallback, delay, ...args);

            // タイマーIDをマッピング
            (call as any).timerId = timerId;

            return timerId;
        } as any;

        // setTimeoutをインターセプト
        window.setTimeout = function(callback: any, delay?: number, ...args: any[]): any {
            const stack = new Error().stack || "";
            const id = self.nextId++;

            const call: PollingCall = {
                id,
                type: "setTimeout",
                delay,
                stack,
                createdAt: Date.now(),
                executionCount: 0,
                disabled: self.shouldDisable(stack),
            };

            self.calls.set(id, call);

            if (call.disabled) {
                console.log(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);
                return id;
            }

            const wrappedCallback = function(...callbackArgs: any[]) {
                call.executionCount++;
                call.lastExecutedAt = Date.now();
                self.calls.delete(id); // setTimeoutは一度だけ実行
                return callback.apply(this, callbackArgs);
            };

            const timerId = self.originalSetTimeout(wrappedCallback, delay, ...args);
            (call as any).timerId = timerId;

            return timerId;
        } as any;

        // requestAnimationFrameをインターセプト
        window.requestAnimationFrame = function(callback: FrameRequestCallback): number {
            const stack = new Error().stack || "";
            const id = self.nextId++;

            const call: PollingCall = {
                id,
                type: "requestAnimationFrame",
                stack,
                createdAt: Date.now(),
                executionCount: 0,
                disabled: self.shouldDisable(stack),
            };

            self.calls.set(id, call);

            if (call.disabled) {
                console.log(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);
                return id;
            }

            const wrappedCallback = function(time: number) {
                call.executionCount++;
                call.lastExecutedAt = Date.now();
                self.calls.delete(id);
                return callback(time);
            };

            const frameId = self.originalRequestAnimationFrame(wrappedCallback);
            (call as any).frameId = frameId;

            return frameId;
        };

        console.log("[PollingMonitor] Monitoring started");
    }

    /**
     * モニタリングを停止
     */
    stop() {
        if (!this.enabled) return;

        window.setInterval = this.originalSetInterval;
        window.setTimeout = this.originalSetTimeout;
        window.clearInterval = this.originalClearInterval;
        window.clearTimeout = this.originalClearTimeout;
        window.requestAnimationFrame = this.originalRequestAnimationFrame;
        window.cancelAnimationFrame = this.originalCancelAnimationFrame;

        this.enabled = false;
        console.log("[PollingMonitor] Monitoring stopped");
    }

    /**
     * スタックトレースから無効化すべきかを判定
     */
    private shouldDisable(stack: string): boolean {
        return this.disablePatterns.some(pattern => pattern.test(stack));
    }

    /**
     * 無効化パターンを追加
     */
    addDisablePattern(pattern: RegExp) {
        this.disablePatterns.push(pattern);
    }

    /**
     * 無効化パターンをクリア
     */
    clearDisablePatterns() {
        this.disablePatterns = [];
    }

    /**
     * 統計情報を取得
     */
    getStats(): PollingStats {
        return {
            totalCalls: this.calls.size,
            activeCalls: Array.from(this.calls.values()).filter(c => !c.disabled).length,
            disabledCalls: Array.from(this.calls.values()).filter(c => c.disabled).length,
            calls: new Map(this.calls),
        };
    }

    /**
     * レポートを生成
     */
    generateReport(): string {
        const stats = this.getStats();
        const calls = Array.from(stats.calls.values());

        let report = "=== Polling Monitor Report ===\n\n";
        report += `Total calls: ${stats.totalCalls}\n`;
        report += `Active calls: ${stats.activeCalls}\n`;
        report += `Disabled calls: ${stats.disabledCalls}\n\n`;

        // 実行回数でソート
        calls.sort((a, b) => b.executionCount - a.executionCount);

        report += "=== Top Polling Calls (by execution count) ===\n\n";

        for (const call of calls.slice(0, 20)) {
            report += `ID: ${call.id}\n`;
            report += `Type: ${call.type}\n`;
            report += `Delay: ${call.delay}ms\n`;
            report += `Execution count: ${call.executionCount}\n`;
            report += `Disabled: ${call.disabled}\n`;
            report += `Stack:\n${this.formatStack(call.stack)}\n`;
            report += "---\n\n";
        }

        return report;
    }

    /**
     * スタックトレースをフォーマット
     */
    private formatStack(stack: string): string {
        const lines = stack.split("\n").slice(1, 6); // 最初の5行のみ
        return lines.map(line => `  ${line.trim()}`).join("\n");
    }

    /**
     * 統計をリセット
     */
    reset() {
        this.calls.clear();
        this.nextId = 1;
    }
}

// シングルトンインスタンス
export const pollingMonitor = new PollingMonitor();

// グローバルに公開（デバッグ用）
if (typeof window !== "undefined") {
    (window as any).__pollingMonitor = pollingMonitor;
}
