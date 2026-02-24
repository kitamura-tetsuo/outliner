/**
 * Polling Test Helper
 *
 * Utility to identify unnecessary polling using PollingMonitor in E2E tests
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
 * Initialize Polling Monitor
 */
export async function initPollingMonitor(page: Page) {
    await page.addInitScript(() => {
        // Inline pollingMonitor.ts content
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

                window.setTimeout = ((callback: any, delay?: number, ...args: any[]): any => {
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
                }) as unknown as typeof window.setTimeout;
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
 * Start Polling Monitor
 */
export async function startPollingMonitor(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.start();
    });
}

/**
 * Get Polling Stats
 */
export async function getPollingStats(page: Page) {
    return await page.evaluate(() => {
        return (window as any).__pollingMonitor?.getStats();
    });
}

/**
 * Disable polling matching a specific pattern
 */
export async function disablePollingPattern(page: Page, pattern: RegExp) {
    await page.evaluate((patternStr) => {
        const regex = new RegExp(patternStr);
        (window as any).__pollingMonitor?.addDisablePattern(regex);
    }, pattern.source);
}

/**
 * Clear disable patterns
 */
export async function clearDisablePatterns(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.clearDisablePatterns();
    });
}

/**
 * Reset Polling Monitor
 */
export async function resetPollingMonitor(page: Page) {
    await page.evaluate(() => {
        (window as any).__pollingMonitor?.reset();
    });
}

/**
 * Run test with specific polling disabled
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

    // 1. Test WITH polling
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

    // 2. Test WITHOUT polling
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

    // 3. Determine Result
    result.isRemovable = result.withPolling.passed && result.withoutPolling.passed;

    if (result.isRemovable) {
        console.log(`[${testName}] ✓ This polling is removable`);
    } else if (!result.withPolling.passed) {
        console.log(`[${testName}] ⚠ The test itself failed`);
    } else {
        console.log(`[${testName}] ✗ This polling is necessary`);
    }

    return result;
}

/**
 * Generate Report
 */
export function generatePollingTestReport(results: PollingTestResult[]): string {
    let report = "# Polling Removability Test Report\n\n";
    report += `Generated at: ${new Date().toISOString()}\n\n`;
    report += `## Overview\n\n`;
    report += `- Tests Executed: ${results.length}\n`;
    report += `- Removable: ${results.filter(r => r.isRemovable).length}\n`;
    report += `- Necessary: ${results.filter(r => !r.isRemovable).length}\n\n`;

    const removable = results.filter(r => r.isRemovable);
    if (removable.length > 0) {
        report += `## Removable Polling\n\n`;
        for (const result of removable) {
            report += `### ${result.testName}\n\n`;
            report += `- **Pattern**: \`${result.pollingPattern.source}\`\n`;
            report += `- **With Polling**: ${result.withPolling.duration}ms\n`;
            report += `- **Without Polling**: ${result.withoutPolling.duration}ms\n`;
            report += `- **Recommendation**: This polling can be safely removed\n\n`;
        }
    }

    const necessary = results.filter(r => !r.isRemovable);
    if (necessary.length > 0) {
        report += `## Necessary Polling\n\n`;
        for (const result of necessary) {
            report += `### ${result.testName}\n\n`;
            report += `- **Pattern**: \`${result.pollingPattern.source}\`\n`;
            report += `- **With Polling**: ${
                result.withPolling.passed ? "✓" : "✗"
            } (${result.withPolling.duration}ms)\n`;
            report += `- **Without Polling**: ${
                result.withoutPolling.passed ? "✓" : "✗"
            } (${result.withoutPolling.duration}ms)\n`;
            if (result.withoutPolling.error) {
                report += `- **Error**: ${result.withoutPolling.error}\n`;
            }
            report += `- **Recommendation**: This polling is necessary\n\n`;
        }
    }

    return report;
}
