import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// List of ports to kill
const PORTS_TO_KILL = [
    7070,
    7071,
    7072,
    7090,
    7091,
    7092,
    7093,
    54000,
    57070,
    57000,
    59099,
    58080,
    59200,
    4400,
    4401,
    9099,
    8080,
    9323,
    9324,
];

/**
 * Kill process running on specified port
 */
async function killProcessOnPort(port) {
    console.log(`Checking for processes on port ${port}...`);

    try {
        const { stdout } = await execAsync(`lsof -i :${port} -t`);

        if (stdout.trim()) {
            const pids = stdout.trim().split("\n");
            console.log(`Found processes on port ${port}: ${pids.join(", ")}`);

            for (const pid of pids) {
                console.log(`Killing process with PID: ${pid}`);
                await execAsync(`kill -9 ${pid}`);
            }
            console.log(`All processes on port ${port} killed successfully`);
            return true;
        } else {
            console.log(`No process found on port ${port}`);
            return false;
        }
    } catch (error) {
        // Only log error if it's not just "no process found"
        if (error.code !== 1 || error.stdout || error.stderr) {
            console.error(`Error checking or killing process on port ${port}:`, error.message);
        } else {
            console.log(`No process found on port ${port}`);
        }
        return false;
    }
}

// Main execution function
async function main() {
    console.log("Starting cleanup of development processes...");

    let successCount = 0;

    // Process for each port
    for (const port of PORTS_TO_KILL) {
        const success = await killProcessOnPort(port);
        if (success) successCount++;
    }

    console.log(`Cleanup completed. Successfully processed ${successCount}/${PORTS_TO_KILL.length} ports.`);
}

// Execute script
main().catch(error => {
    console.error("Unexpected error during execution:", error);
    process.exit(1);
});
