import { exec } from 'child_process';

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
}
