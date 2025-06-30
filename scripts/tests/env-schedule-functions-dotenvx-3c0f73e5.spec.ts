import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

/** @feature ENV-0009
 *  Title   : Schedule management functions load env via dotenvx
 */

test('schedule management functions load env variables with dotenvx', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..', '..');

  const command = "node -e \"const f = require('./index.js'); console.log(typeof f.createSchedule === 'function' && process.env.AZURE_TENANT_ID)\"";
  const functionsDir = path.join(repoRoot, 'functions');
  const output = execSync(command, { cwd: functionsDir }).toString().trim();
  const lastLine = output.split('\n').pop();
  expect(lastLine).toBe('test-tenant-id');
});
