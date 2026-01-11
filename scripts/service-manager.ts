import { exec, spawn } from "child_process";

export class ServiceManager {
    /**
     * Checks if a port is currently in use.
     * @param port The port number to check.
     * @returns A promise that resolves to true if the port is active, and false otherwise.
     */
    static isPortActive(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`lsof -i :${port}`, (error, stdout) => {
                if (error) {
                    resolve(false);
                    return;
                }
                resolve(stdout.trim().length > 0);
            });
        });
    }

    /**
     * Finds the process ID (PID) of the process using a specific port.
     * @param port The port number to check.
     * @returns A promise that resolves to the PID of the process, or null if no process is using the port.
     */
    static findPidByPort(port: number): Promise<number | null> {
        return new Promise((resolve) => {
            exec(`lsof -i :${port} -t`, (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }
                const pid = parseInt(stdout.trim(), 10);
                resolve(isNaN(pid) ? null : pid);
            });
        });
    }

    /**
     * Starts a service if it is not already running.
     * @param serviceName The name of the service to start.
     * @param command The command to start the service.
     * @param port The port to check for the service.
     * @param timeout The timeout in milliseconds to wait for the service to start.
     * @returns A promise that resolves when the service is started.
     */
    static async startService(
        serviceName: string,
        command: string,
        args: string[],
        port: number,
        timeout: number = 10000,
    ): Promise<void> {
        if (await this.isPortActive(port)) {
            console.log(`${serviceName} is already running on port ${port}.`);
            return;
        }

        console.log(`Starting ${serviceName}...`);
        const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
        });
        child.unref();

        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (await this.isPortActive(port)) {
                console.log(`${serviceName} started successfully on port ${port}.`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        throw new Error(`Timeout waiting for ${serviceName} to start on port ${port}.`);
    }
}
