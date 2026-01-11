import { spawn } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceManager } from "../service-manager";

// Mock child_process
vi.mock("child_process", () => ({
    exec: vi.fn(),
    spawn: vi.fn(() => ({
        unref: vi.fn(),
    })),
}));

describe("ServiceManager", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe("startService", () => {
        it("should log a message and return if the service is already running", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(ServiceManager, "isPortActive").mockResolvedValue(true);

            await ServiceManager.startService("test-service", "test-command", [], 1234);

            expect(consoleLogSpy).toHaveBeenCalledWith("test-service is already running on port 1234.");
            expect(spawn).not.toHaveBeenCalled();
            consoleLogSpy.mockRestore();
        });

        it("should start the service and resolve when the port becomes active", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const isPortActiveSpy = vi.spyOn(ServiceManager, "isPortActive")
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await ServiceManager.startService("test-service", "test-command", ["with-args"], 1234);

            expect(spawn).toHaveBeenCalledWith("test-command", ["with-args"], {
                detached: true,
                stdio: "ignore",
            });
            expect(consoleLogSpy).toHaveBeenCalledWith("Starting test-service...");
            expect(consoleLogSpy).toHaveBeenCalledWith("test-service started successfully on port 1234.");
            expect(isPortActiveSpy).toHaveBeenCalledTimes(3);
            consoleLogSpy.mockRestore();
        });

        it("should throw an error if the service fails to start within the timeout", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(ServiceManager, "isPortActive").mockResolvedValue(false);

            // To avoid waiting for the real timeout, we can use fake timers
            vi.useFakeTimers();
            const promise = ServiceManager.startService("test-service", "test-command", [], 1234, 4000);
            vi.advanceTimersByTime(4100);

            await expect(promise).rejects.toThrow(
                "Timeout waiting for test-service to start on port 1234.",
            );

            consoleLogSpy.mockRestore();
            vi.useRealTimers();
        }, 6000);
    });
});
