/** @feature LOG-0002
 *  Title   : Log rotation endpoint
 *  Source  : docs/client-features/log-rotate-log-files-endpoint-6f1a5793.yaml
 */
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

test.describe('LOG-0002: /api/rotate-logs', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const serverLog = path.resolve(__dirname, '../../..', 'server', 'logs', 'log-service.log');

  test('rotates logs via endpoint', async ({ request }) => {
    const res = await request.post('http://localhost:7091/api/rotate-logs');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.timestamp).toBe('string');

    const backup = serverLog + '.1';
    const exists = fs.existsSync(backup);
    expect(exists).toBe(true);
  });
});
