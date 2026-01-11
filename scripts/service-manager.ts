import { exec, spawn } from "child_process";

interface ServiceConfig {
    name: string;
    command: string;
    args: string[];
    port: number;
    cwd: string;
}

const services: ServiceConfig[] = [
    {
        name: "yjs-server",
        command: "npx",
        args: [
            "dotenvx",
            "run",
            "--env-file=./.env.test",
            "--",
            "bash",
            "-c",
            "PORT=7093 npm start --silent",
        ],
        port: 7093,
        cwd: "../server",
    },
    {
        name: "vite-server",
        command: "npx",
        args: [
            "dotenvx",
            "run",
            "--env-file=./.env.test",
            "--",
            "npm",
            "run",
            "dev",
            "--",
            "--host",
            "0.0.0.0",
            "--port",
            "7090",
        ],
        port: 7090,
        cwd: "../client",
    },
    {
        name: "firebase-emulators",
        command: "firebase",
        args: [
            "emulators:start",
            "--only",
            "auth,firestore,functions,hosting,storage",
            "--config",
            "firebase.emulator.json",
            "--project",
            "outliner-d57b0",
        ],
        port: 57000, // Hosting port
        cwd: "../",
    },
];

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
        cwd: string,
        timeout: number = 10000,
    ): Promise<void> {
        if (await this.isPortActive(port)) {
            return;
        }

        console.log(`[${new Date().toISOString()}] Attempting to start ${serviceName}...`);
        const child = spawn(command, args, {
            detached: true,
            stdio: "ignore",
            cwd,
        });
        child.unref();

        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if (await this.isPortActive(port)) {
                console.log(`[${new Date().toISOString()}] ${serviceName} started successfully on port ${port}.`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        throw new Error(`[${new Date().toISOString()}] Timeout waiting for ${serviceName} to start on port ${port}.`);
    }

    static async monitorServices(services: ServiceConfig[], interval: number = 5000): Promise<void> {
        const serviceStatus: { [key: string]: boolean } = {};

        console.log("Starting service monitor...");

        for (const service of services) {
            const isActive = await this.isPortActive(service.port);
            serviceStatus[service.name] = isActive;
            console.log(`[${new Date().toISOString()}] Initial status for ${service.name}: ${isActive ? "UP" : "DOWN"}`);
            if (!isActive) {
                try {
                    await this.startService(service.name, service.command, service.args, service.port, service.cwd);
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] Failed to start ${service.name}:`, error);
                }
            }
        }

        while (true) {
            for (const service of services) {
                const isCurrentlyActive = await this.isPortActive(service.port);
                const wasPreviouslyActive = serviceStatus[service.name];

                if (isCurrentlyActive !== wasPreviouslyActive) {
                    serviceStatus[service.name] = isCurrentlyActive;
                    const status = isCurrentlyActive ? "UP" : "DOWN";
                    console.log(`[${new Date().toISOString()}] Status change for ${service.name}: Now ${status}`);

                    if (!isCurrentlyActive) {
                        try {
                            await this.startService(service.name, service.command, service.args, service.port, service.cwd);
                        } catch (error) {
                            console.error(`[${new Date().toISOString()}] Failed to restart ${service.name}:`, error);
                        }
                    }
                }
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === "monitor") {
        ServiceManager.monitorServices(services).catch((err) => {
            console.error("Monitoring failed:", err);
            process.exit(1);
        });
    }
}
