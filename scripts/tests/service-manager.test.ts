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
        it("should not log or spawn if the service is already running", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(ServiceManager, "isPortActive").mockResolvedValue(true);

            await ServiceManager.startService("test-service", "test-command", [], 1234, "/tmp");

            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(spawn).not.toHaveBeenCalled();
            consoleLogSpy.mockRestore();
        });

        it("should start the service and resolve when the port becomes active", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const isPortActiveSpy = vi
                .spyOn(ServiceManager, "isPortActive")
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await ServiceManager.startService("test-service", "test-command", ["with-args"], 1234, "/tmp");

            expect(spawn).toHaveBeenCalledWith("test-command", ["with-args"], {
                detached: true,
                stdio: "ignore",
                cwd: "/tmp",
            });
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Attempting to start test-service..."));
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("test-service started successfully on port 1234."),
            );
            expect(isPortActiveSpy).toHaveBeenCalledTimes(3);
            consoleLogSpy.mockRestore();
        });

        it("should throw an error if the service fails to start within the timeout", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(ServiceManager, "isPortActive").mockResolvedValue(false);

            vi.useFakeTimers();
            const promise = ServiceManager.startService("test-service", "test-command", [], 1234, "/tmp", 4000);
            promise.catch(() => {}); // Suppress unhandled rejection warning
            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow("Timeout waiting for test-service to start on port 1234.");

            consoleLogSpy.mockRestore();
            vi.useRealTimers();
        }, 6000);
    });

    describe("monitorServices", () => {
        it("should start services that are initially down and restart them if they go down", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const isPortActiveSpy = vi.spyOn(ServiceManager, "isPortActive");
            const startServiceSpy = vi.spyOn(ServiceManager, "startService").mockResolvedValue(undefined);

            const services = [
                { name: "service1", command: "cmd1", args: [], port: 1, cwd: "/tmp" },
                { name: "service2", command: "cmd2", args: [], port: 2, cwd: "/tmp" },
            ];

            // Initial state: service1 is up, service2 is down
            isPortActiveSpy.mockImplementation(async (port) => port === 1);

            vi.useFakeTimers();
            ServiceManager.monitorServices(services, 1000);
            await vi.advanceTimersByTimeAsync(100);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Initial status for service1: UP"));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Initial status for service2: DOWN"));
            expect(startServiceSpy).toHaveBeenCalledWith("service2", "cmd2", [], 2, "/tmp");
            expect(startServiceSpy).toHaveBeenCalledTimes(1);

            // Simulate service1 going down
            isPortActiveSpy.mockImplementation(async (port) => false);
            await vi.advanceTimersByTimeAsync(1000);

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Status change for service1: Now DOWN"));
            expect(startServiceSpy).toHaveBeenCalledWith("service1", "cmd1", [], 1, "/tmp");
            expect(startServiceSpy).toHaveBeenCalledTimes(2);

            vi.useRealTimers();
            consoleLogSpy.mockRestore();
        });

        it("should log an error if a service fails to start", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            vi.spyOn(ServiceManager, "isPortActive").mockResolvedValue(false);
            vi.spyOn(ServiceManager, "startService").mockRejectedValue(new Error("Failed to start"));

            const services = [{ name: "service1", command: "cmd1", args: [], port: 1, cwd: "/tmp" }];

            vi.useFakeTimers();
            ServiceManager.monitorServices(services, 1000);
            await vi.advanceTimersByTimeAsync(100);

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("Failed to start service1:"),
                expect.any(Error),
            );

            vi.useRealTimers();
            consoleErrorSpy.mockRestore();
        });
    });
});
