import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollingMonitor } from "./pollingMonitor";

describe("PollingMonitor", () => {
    let monitor: PollingMonitor;

    beforeEach(() => {
        vi.useFakeTimers();
        monitor = new PollingMonitor();
    });

    afterEach(() => {
        monitor.stop();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe("start/stop", () => {
        it("should intercept and restore window functions", () => {
            const originalSetInterval = window.setInterval;
            const originalSetTimeout = window.setTimeout;
            const originalRAF = window.requestAnimationFrame;

            monitor.start();

            expect(window.setInterval).not.toBe(originalSetInterval);
            expect(window.setTimeout).not.toBe(originalSetTimeout);
            expect(window.requestAnimationFrame).not.toBe(originalRAF);

            monitor.stop();

            expect(window.setInterval).toBe(originalSetInterval);
            expect(window.setTimeout).toBe(originalSetTimeout);
            expect(window.requestAnimationFrame).toBe(originalRAF);
        });

        it("should not start twice", () => {
            monitor.start();
            const interceptedSetInterval = window.setInterval;
            monitor.start();
            expect(window.setInterval).toBe(interceptedSetInterval);
        });

        it("should handle stopping when not enabled", () => {
            const monitor2 = new PollingMonitor();
            expect(() => monitor2.stop()).not.toThrow();
        });
    });

    describe("setInterval tracking", () => {
        it("should track setInterval calls", () => {
            monitor.start();
            const callback = vi.fn();
            const delay = 100;

            const timerId = window.setInterval(callback, delay);
            const stats = monitor.getStats();

            expect(stats.totalCalls).toBe(1);
            const call = stats.calls.get(1);
            expect(call).toBeDefined();
            expect(call?.type).toBe("setInterval");
            expect(call?.delay).toBe(delay);
            expect(call?.executionCount).toBe(0);

            // timerId might be different from internal ID
            expect(call?.timerId).toBe(timerId);

            vi.advanceTimersByTime(delay);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(call?.executionCount).toBe(1);
            expect(call?.lastExecutedAt).toBeDefined();

            vi.advanceTimersByTime(delay);
            expect(callback).toHaveBeenCalledTimes(2);
            expect(call?.executionCount).toBe(2);

            window.clearInterval(timerId);
            expect(monitor.getStats().totalCalls).toBe(0);
        });

        it("should support string callbacks", () => {
            monitor.start();
            window.setInterval("window.__test_val = (window.__test_val || 0) + 1", 100);
            vi.advanceTimersByTime(100);
            expect((window as { __test_val?: number; }).__test_val).toBe(1);
            delete (window as { __test_val?: number; }).__test_val;
        });

        it("should handle clearInterval(undefined)", () => {
            monitor.start();
            window.clearInterval(undefined as unknown as number);
            expect(monitor.getStats().totalCalls).toBe(0);
        });

        it("should handle clearInterval with unknown ID", () => {
            monitor.start();
            window.clearInterval(9999);
            expect(monitor.getStats().totalCalls).toBe(0);
        });
    });

    describe("setTimeout tracking", () => {
        it("should track setTimeout calls and remove after execution", () => {
            monitor.start();
            const callback = vi.fn();
            const delay = 100;

            window.setTimeout(callback, delay);
            expect(monitor.getStats().totalCalls).toBe(1);

            vi.advanceTimersByTime(delay);
            expect(callback).toHaveBeenCalledTimes(1);
            expect(monitor.getStats().totalCalls).toBe(0); // Removed after execution
        });

        it("should remove entry on clearTimeout", () => {
            monitor.start();
            const timerId = window.setTimeout(() => {}, 100);
            expect(monitor.getStats().totalCalls).toBe(1);
            window.clearTimeout(timerId);
            expect(monitor.getStats().totalCalls).toBe(0);
        });

        it("should support string callbacks", () => {
            monitor.start();
            window.setTimeout("window.__test_val_timeout = (window.__test_val_timeout || 0) + 1", 100);
            vi.advanceTimersByTime(100);
            expect((window as { __test_val_timeout?: number; }).__test_val_timeout).toBe(1);
            delete (window as { __test_val_timeout?: number; }).__test_val_timeout;
        });

        it("should handle clearTimeout(undefined)", () => {
            monitor.start();
            window.clearTimeout(undefined as unknown as number);
            expect(monitor.getStats().totalCalls).toBe(0);
        });
    });

    describe("requestAnimationFrame tracking", () => {
        it("should track requestAnimationFrame calls and remove after execution", () => {
            monitor.start();
            const callback = vi.fn();

            window.requestAnimationFrame(callback);
            expect(monitor.getStats().totalCalls).toBe(1);

            // In JSDOM, requestAnimationFrame is usually mocked via timers
            vi.runAllTimers();

            expect(callback).toHaveBeenCalled();
            expect(monitor.getStats().totalCalls).toBe(0);
        });

        it("should remove entry on cancelAnimationFrame", () => {
            monitor.start();
            const frameId = window.requestAnimationFrame(() => {});
            expect(monitor.getStats().totalCalls).toBe(1);
            window.cancelAnimationFrame(frameId);
            expect(monitor.getStats().totalCalls).toBe(0);
        });
    });

    describe("disabling polling", () => {
        it("should disable polling if stack matches pattern (setInterval)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            // Inherit static methods like captureStackTrace
            Object.setPrototypeOf(global.Error, originalError);

            const callback = vi.fn();
            window.setInterval(callback, 100);

            const stats = monitor.getStats();
            expect(stats.disabledCalls).toBe(1);
            // Internal ID for disabled call should be -1
            expect(stats.calls.get(-1)?.disabled).toBe(true);

            vi.advanceTimersByTime(100);
            expect(callback).not.toHaveBeenCalled();

            global.Error = originalError;
        });

        it("should disable polling if stack matches pattern (setTimeout)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            const callback = vi.fn();
            window.setTimeout(callback, 100);

            const stats = monitor.getStats();
            expect(stats.disabledCalls).toBe(1);

            vi.advanceTimersByTime(100);
            expect(callback).not.toHaveBeenCalled();

            global.Error = originalError;
        });

        it("should disable polling if stack matches pattern (requestAnimationFrame)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            const callback = vi.fn();
            window.requestAnimationFrame(callback);

            const stats = monitor.getStats();
            expect(stats.disabledCalls).toBe(1);

            vi.runAllTimers();
            expect(callback).not.toHaveBeenCalled();

            global.Error = originalError;
        });

        it("should clear disable patterns", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.clearDisablePatterns();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            monitor.start();
            const callback = vi.fn();
            window.setInterval(callback, 100);
            expect(monitor.getStats().disabledCalls).toBe(0);

            vi.advanceTimersByTime(100);
            expect(callback).toHaveBeenCalled();

            global.Error = originalError;
        });

        it("should remove disabled calls from map when cleared (setInterval)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            const dummyId = window.setInterval(() => {}, 100);
            expect(monitor.getStats().totalCalls).toBe(1);

            window.clearInterval(dummyId);
            expect(monitor.getStats().totalCalls).toBe(0);

            global.Error = originalError;
        });

        it("should remove disabled calls from map when cleared (setTimeout)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            const dummyId = window.setTimeout(() => {}, 100);
            expect(monitor.getStats().totalCalls).toBe(1);

            window.clearTimeout(dummyId);
            expect(monitor.getStats().totalCalls).toBe(0);

            global.Error = originalError;
        });

        it("should remove disabled calls from map when cleared (requestAnimationFrame)", () => {
            monitor.addDisablePattern(/test-trigger/);
            monitor.start();

            const originalError = global.Error;
            global.Error = function(this: Error) {
                const err = new originalError();
                err.stack = "Error\n at test-trigger (file.js:1:1)";
                return err;
            } as unknown as typeof Error;
            Object.setPrototypeOf(global.Error, originalError);

            const dummyId = window.requestAnimationFrame(() => {});
            expect(monitor.getStats().totalCalls).toBe(1);

            window.cancelAnimationFrame(dummyId);
            expect(monitor.getStats().totalCalls).toBe(0);

            global.Error = originalError;
        });
    });

    describe("report and reset", () => {
        it("should generate a report", () => {
            monitor.start();
            const id1 = window.setInterval(() => {}, 100);
            const id2 = window.setInterval(() => {}, 200);

            // Trigger some executions to test sorting
            vi.advanceTimersByTime(200);

            const report = monitor.generateReport();
            expect(report).toContain("=== Polling Monitor Report ===");
            expect(report).toContain("Total calls: 2");
            expect(report).toContain("Active calls: 2");
            expect(report).toContain("ID: 1");
            expect(report).toContain("ID: 2");

            window.clearInterval(id1);
            window.clearInterval(id2);
        });

        it("should reset statistics", () => {
            monitor.start();
            window.setInterval(() => {}, 100);
            expect(monitor.getStats().totalCalls).toBe(1);

            monitor.reset();
            expect(monitor.getStats().totalCalls).toBe(0);

            // nextId should be reset to 1
            window.setInterval(() => {}, 100);
            expect(monitor.getStats().calls.has(1)).toBe(true);
        });
    });
});
