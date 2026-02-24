/**
 * Polling Monitor
 *
 * Intercepts setInterval/setTimeout in the browser and tracks the execution status of each polling.
 *
 * Can be used in test environments to identify unnecessary polling.
 */

// Type definition for FrameRequestCallback to avoid no-undef errors
type FrameRequestCallback = (time: number) => void;

export interface PollingCall {
    id: number;
    type: "setInterval" | "setTimeout" | "requestAnimationFrame";
    delay?: number;
    stack: string;
    createdAt: number;
    executionCount: number;
    lastExecutedAt?: number;
    disabled: boolean;
    timerId?: number;
    frameId?: number;
}

export interface PollingStats {
    totalCalls: number;
    activeCalls: number;
    disabledCalls: number;
    calls: Map<number, PollingCall>;
}

export class PollingMonitor {
    private calls: Map<number, PollingCall> = new Map();
    private nextId = 1;
    private enabled = false;

    // Save original functions
    private originalSetInterval: typeof setInterval;
    private originalSetTimeout: typeof setTimeout;
    private originalClearInterval: typeof clearInterval;
    private originalClearTimeout: typeof clearTimeout;
    private originalRequestAnimationFrame: typeof requestAnimationFrame;
    private originalCancelAnimationFrame: typeof cancelAnimationFrame;

    // Patterns for polling to be disabled
    private disablePatterns: RegExp[] = [];

    constructor() {
        this.originalSetInterval = window.setInterval;
        this.originalSetTimeout = window.setTimeout;
        this.originalClearInterval = window.clearInterval;
        this.originalClearTimeout = window.clearTimeout;
        this.originalRequestAnimationFrame = window.requestAnimationFrame;
        this.originalCancelAnimationFrame = window.cancelAnimationFrame;
    }

    /**
     * Start monitoring
     */
    start() {
        if (this.enabled) return;
        this.enabled = true;

        // Intercept setInterval
        window.setInterval =
            ((callback: ((...args: unknown[]) => void) | string, delay?: number, ...args: unknown[]): number => {
                const stack = new Error().stack || "";
                const disabled = this.shouldDisable(stack);
                // Use negative IDs for disabled calls to avoid collision with native timer IDs
                const id = disabled ? -(this.nextId++) : this.nextId++;

                const call: PollingCall = {
                    id,
                    type: "setInterval",
                    delay,
                    stack,
                    createdAt: Date.now(),
                    executionCount: 0,
                    disabled,
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    console.log(`[PollingMonitor] Disabled setInterval (id=${id}, delay=${delay}ms)`);
                    // Return a dummy ID
                    return id;
                }

                // Wrapped callback
                const wrappedCallback = (...callbackArgs: unknown[]) => {
                    call.executionCount++;
                    call.lastExecutedAt = Date.now();
                    if (typeof callback === "function") {
                        return callback(...callbackArgs);
                    } else {
                        return eval(callback);
                    }
                };

                const timerId = this.originalSetInterval.call(window, wrappedCallback, delay, ...args);

                // Map timer ID
                call.timerId = timerId;

                return timerId;
            }) as typeof window.setInterval;

        // Intercept clearInterval
        window.clearInterval = (id: number | undefined) => {
            if (id !== undefined) {
                for (const [internalId, call] of this.calls.entries()) {
                    if (call.timerId === id || (call.disabled && call.id === id)) {
                        this.calls.delete(internalId);
                        break;
                    }
                }
            }
            return this.originalClearInterval.call(window, id);
        };

        // Intercept setTimeout
        const wrappedSetTimeout =
            ((callback: ((...args: unknown[]) => void) | string, delay?: number, ...args: unknown[]) => {
                const stack = new Error().stack || "";
                const disabled = this.shouldDisable(stack);
                // Use negative IDs for disabled calls to avoid collision with native timer IDs
                const id = disabled ? -(this.nextId++) : this.nextId++;

                const call: PollingCall = {
                    id,
                    type: "setTimeout",
                    delay,
                    stack,
                    createdAt: Date.now(),
                    executionCount: 0,
                    disabled,
                };

                this.calls.set(id, call);

                if (call.disabled) {
                    console.log(`[PollingMonitor] Disabled setTimeout (id=${id}, delay=${delay}ms)`);
                    return id;
                }

                const wrappedCallback = (...callbackArgs: unknown[]) => {
                    call.executionCount++;
                    call.lastExecutedAt = Date.now();
                    this.calls.delete(id); // setTimeout is executed only once
                    if (typeof callback === "function") {
                        return callback(...callbackArgs);
                    } else {
                        return eval(callback);
                    }
                };

                const timerId = this.originalSetTimeout.call(window, wrappedCallback, delay, ...args);
                call.timerId = timerId;

                return timerId;
            }) as typeof window.setTimeout;

        // Node's `setTimeout` has an extra `__promisify__` property; keep it when swapping the function.
        (wrappedSetTimeout as unknown as { __promisify__?: unknown; }).__promisify__ =
            (this.originalSetTimeout as unknown as { __promisify__?: unknown; }).__promisify__;

        window.setTimeout = wrappedSetTimeout;

        // Intercept clearTimeout
        window.clearTimeout = (id: number | undefined) => {
            if (id !== undefined) {
                for (const [internalId, call] of this.calls.entries()) {
                    if (call.timerId === id || (call.disabled && call.id === id)) {
                        this.calls.delete(internalId);
                        break;
                    }
                }
            }
            return this.originalClearTimeout.call(window, id);
        };

        // Intercept requestAnimationFrame
        window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            const stack = new Error().stack || "";
            const disabled = this.shouldDisable(stack);
            // Use negative IDs for disabled calls to avoid collision with native timer IDs
            const id = disabled ? -(this.nextId++) : this.nextId++;

            const call: PollingCall = {
                id,
                type: "requestAnimationFrame",
                stack,
                createdAt: Date.now(),
                executionCount: 0,
                disabled,
            };

            this.calls.set(id, call);

            if (call.disabled) {
                console.log(`[PollingMonitor] Disabled requestAnimationFrame (id=${id})`);
                return id;
            }

            const wrappedCallback = (time: number) => {
                call.executionCount++;
                call.lastExecutedAt = Date.now();
                this.calls.delete(id);
                return callback(time);
            };

            const frameId = this.originalRequestAnimationFrame.call(window, wrappedCallback);
            call.frameId = frameId;

            return frameId;
        };

        // Intercept cancelAnimationFrame
        window.cancelAnimationFrame = (id: number) => {
            for (const [internalId, call] of this.calls.entries()) {
                if (call.frameId === id || (call.disabled && call.id === id)) {
                    this.calls.delete(internalId);
                    break;
                }
            }
            return this.originalCancelAnimationFrame.call(window, id);
        };

        console.log("[PollingMonitor] Monitoring started");
    }

    /**
     * Stop monitoring
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
     * Determine if it should be disabled based on the stack trace
     */
    private shouldDisable(stack: string): boolean {
        return this.disablePatterns.some(pattern => pattern.test(stack));
    }

    /**
     * Add disable pattern
     */
    addDisablePattern(pattern: RegExp) {
        this.disablePatterns.push(pattern);
    }

    /**
     * Clear disable patterns
     */
    clearDisablePatterns() {
        this.disablePatterns = [];
    }

    /**
     * Get statistics
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
     * Generate report
     */
    generateReport(): string {
        const stats = this.getStats();
        const calls = Array.from(stats.calls.values());

        let report = "=== Polling Monitor Report ===\n\n";
        report += `Total calls: ${stats.totalCalls}\n`;
        report += `Active calls: ${stats.activeCalls}\n`;
        report += `Disabled calls: ${stats.disabledCalls}\n\n`;

        // Sort by execution count
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
     * Format stack trace
     */
    private formatStack(stack: string): string {
        const lines = stack.split("\n").slice(1, 6); // Only the first 5 lines
        return lines.map(line => `  ${line.trim()}`).join("\n");
    }

    /**
     * Reset statistics
     */
    reset() {
        this.calls.clear();
        this.nextId = 1;
    }
}

// Singleton instance
export const pollingMonitor = new PollingMonitor();

// Expose globally (for debugging)
if (typeof window !== "undefined") {
    (window as unknown as { __pollingMonitor: PollingMonitor; }).__pollingMonitor = pollingMonitor;
}
