/**
 * ポーリングテストヘルパー
 *
 * E2Eテストでポーリングモニターを使用して、
 * 不要なポーリングを特定するためのユーティリティ
 */

import type { Page } from "@playwright/test";

export interface PollingTestResult {
    testName: string;
    withPolling: {
        passed: boolean;
        duration: number;
        error?: string;
    };
    withoutPolling: {
        passed: boolean;
        duration: number;
        error?: string;
    };
    pollingPattern: RegExp;
    isRemovable: boolean;
}

/**
 * ポーリングモニターを初期化
 */
export async function initPollingMonitor(page: Page) {
    await page.addInitScript(() => {
        // pollingMonitor.tsの内容をインライン化
        class PollingMonitor {
            private calls: Map<number, any> = new Map();
            private nextId = 1;
            private enabled = false;
            private originalSetInterval: any;
            private originalSetTimeout: any;
            private disablePatterns: RegExp[] = [];

            constructor() {
                this.originalSetInterval = window.setInterval.bind(window);
                this.originalSetTimeout = window.setTimeout.bind(window);
            }

            start() {
                if (this.enabled) return;
                this.enabled = true;

                window.setInterval = (callback: any, delay?: number, ...args: any[]): any => {
                    const stack = new Error().stack || "";
                    const id = this.nextId++;
                    const disabled = this.disablePatterns.some(p => p.test(stack));

                    this.calls.set(id, {
                        id,
                        type: "setInterval",
                        delay,
                        stack,
                        createdAt: Date.now(),
                        executionCount: 0,
                        disabled,
                    });

                    if (disabled) {
                        console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                        return id;
                    }

                    const wrappedCallback = (...callbackArgs: any[]) => {
                        const call = this.calls.get(id);
                        if (call) {
                            call.executionCount++;
                            call.lastExecutedAt = Date.now();
                        }
                        return callback(...callbackArgs);
                    };

                    return this.originalSetInterval(wrappedCallback, delay, ...args);
                };

                (window as any).setTimeout = (callback: any, delay?: number, ...args: any[]): any => {
                    const stack = new Error().stack || "";
                    const id = this.nextId++;
                    const disabled = this.disablePatterns.some(p => p.test(stack));

                    this.calls.set(id, {
                        id,
                        type: "setTimeout",
                        delay,
                        stack,
                        createdAt: Date.now(),
                        executionCount: 0,
                        disabled,
                    });

                    if (disabled) {
                        console.log(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);
                        return id;
                    }

                    const wrappedCallback = (...callbackArgs: any[]) => {
                        const call = this.calls.get(id);
                        if (call) {
                            call.executionCount++;
                            call.lastExecutedAt = Date.now();
                        }
                        this.calls.delete(id);
                        return callback(...callbackArgs);
                    };

                    return this.originalSetTimeout(wrappedCallback, delay, ...args);
                };
            }

            addDisablePattern(pattern: RegExp) {
                this.disablePatterns.push(pattern);
            }

            clearDisablePatterns() {
                this.disablePatterns = [];
            }

            getStats() {
                const calls = Array.from(this.calls.values());
                return {
                    totalCalls: calls.length,
                    activeCalls: calls.filter(c => !c.disabled).length,
                    disabledCalls: calls.filter(c => c.disabled).length,
                    calls: calls,
                };
            }

            reset() {
                this.calls.clear();
                this.nextId = 1;
            }
        }

        (window as any).__pollingMonitor = new PollingMonitor();
    });
}

/**
 * ポーリングモニターを開始
 */
export async function startPollingMonitor(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.start();
    });
}

/**
 * ポーリング統計を取得
 */
export async function getPollingStats(page: Page) {
    return await page.evaluate(() => {
        return (window as any).__pollingMonitor?.getStats();
    });
}

/**
 * 特定のパターンのポーリングを無効化
 */
export async function disablePollingPattern(page: Page, pattern: RegExp) {
    await page.evaluate((patternStr) => {
        const regex = new RegExp(patternStr);
        (window as any).__pollingMonitor?.addDisablePattern(regex);
    }, pattern.source);
}

/**
 * 無効化パターンをクリア
 */
export async function clearDisablePatterns(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.clearDisablePatterns();
    });
}

/**
 * ポーリングモニターをリセット
 */
export async function resetPollingMonitor(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.reset();
    });
}

/**
 * 特定のポーリングを無効化してテストを実行
 */
export async function testWithoutPolling(
    page: Page,
    testName: string,
    pollingPattern: RegExp,
    testFn: () => Promise<void>,
): Promise<PollingTestResult> {
    const result: PollingTestResult = {
        testName,
        withPolling: { passed: false, duration: 0 },
        withoutPolling: { passed: false, duration: 0 },
        pollingPattern,
        isRemovable: false,
    };

    // 1. ポーリングありでテスト
    console.log(`\n[${testName}] Testing WITH polling...`);
    await clearDisablePatterns(page);
    await resetPollingMonitor(page);

    const startWith = Date.now();
    try {
        await testFn();
        result.withPolling.passed = true;
        result.withPolling.duration = Date.now() - startWith;
        console.log(`  ✓ Passed (${result.withPolling.duration}ms)`);
    } catch (error: any) {
        result.withPolling.passed = false;
        result.withPolling.duration = Date.now() - startWith;
        result.withPolling.error = error.message;
        console.log(`  ✗ Failed: ${error.message}`);
    }

    // 2. ポーリングなしでテスト
    console.log(`[${testName}] Testing WITHOUT polling...`);
    await page.reload();
    await disablePollingPattern(page, pollingPattern);
    await resetPollingMonitor(page);

    const startWithout = Date.now();
    try {
        await testFn();
        result.withoutPolling.passed = true;
        result.withoutPolling.duration = Date.now() - startWithout;
        console.log(`  ✓ Passed (${result.withoutPolling.duration}ms)`);
    } catch (error: any) {
        result.withoutPolling.passed = false;
        result.withoutPolling.duration = Date.now() - startWithout;
        result.withoutPolling.error = error.message;
        console.log(`  ✗ Failed: ${error.message}`);
    }

    // 3. 結果を判定
    result.isRemovable = result.withPolling.passed && result.withoutPolling.passed;

    if (result.isRemovable) {
        console.log(`[${testName}] ✓ このポーリングは削除可能です`);
    } else if (!result.withPolling.passed) {
        console.log(`[${testName}] ⚠ テスト自体が失敗しています`);
    } else {
        console.log(`[${testName}] ✗ このポーリングは必要です`);
    }

    return result;
}

/**
 * レポートを生成
 */
export function generatePollingTestReport(results: PollingTestResult[]): string {
    let report = "# ポーリング削除可能性テストレポート\n\n";
    report += `生成日時: ${new Date().toISOString()}\n\n`;
    report += `## 概要\n\n`;
    report += `- テスト実行数: ${results.length}\n`;
    report += `- 削除可能: ${results.filter(r => r.isRemovable).length}\n`;
    report += `- 必要: ${results.filter(r => !r.isRemovable).length}\n\n`;

    const removable = results.filter(r => r.isRemovable);
    if (removable.length > 0) {
        report += `## 削除可能なポーリング\n\n`;
        for (const result of removable) {
            report += `### ${result.testName}\n\n`;
            report += `- **パターン**: \`${result.pollingPattern.source}\`\n`;
            report += `- **ポーリングあり**: ${result.withPolling.duration}ms\n`;
            report += `- **ポーリングなし**: ${result.withoutPolling.duration}ms\n`;
            report += `- **推奨**: このポーリングは削除しても問題ありません\n\n`;
        }
    }

    const necessary = results.filter(r => !r.isRemovable);
    if (necessary.length > 0) {
        report += `## 必要なポーリング\n\n`;
        for (const result of necessary) {
            report += `### ${result.testName}\n\n`;
            report += `- **パターン**: \`${result.pollingPattern.source}\`\n`;
            report += `- **ポーリングあり**: ${
                result.withPolling.passed ? "✓" : "✗"
            } (${result.withPolling.duration}ms)\n`;
            report += `- **ポーリングなし**: ${
                result.withoutPolling.passed ? "✓" : "✗"
            } (${result.withoutPolling.duration}ms)\n`;
            if (result.withoutPolling.error) {
                report += `- **エラー**: ${result.withoutPolling.error}\n`;
            }
            report += `- **推奨**: このポーリングは必要です\n\n`;
        }
    }

    return report;
}
