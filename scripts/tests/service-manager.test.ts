import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ServiceManager } from '../service-manager';
import * as http from 'http';
import type { Server } from 'http';

describe('ServiceManager', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end('ok');
      });
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('isPortActive should return true for an active port', async () => {
    const isActive = await ServiceManager.isPortActive(port);
    expect(isActive).toBe(true);
  });

  it('findPidByPort should return a PID for an active port', async () => {
    const pid = await ServiceManager.findPidByPort(port);
    expect(pid).toBeTypeOf('number');
  });

  it('isPortActive should return false for an inactive port', async () => {
    const inactivePort = port + 1000; // A port that is likely inactive
    const isActive = await ServiceManager.isPortActive(inactivePort);
    expect(isActive).toBe(false);
  });

  it('findPidByPort should return null for an inactive port', async () => {
    const inactivePort = port + 1000; // A port that is likely inactive
    const pid = await ServiceManager.findPidByPort(inactivePort);
    expect(pid).toBeNull();
  });
});
