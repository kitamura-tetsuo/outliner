import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

/** @feature ENV-0008
 *  Title   : Functions load env via dotenvx
 */

test('functions env variables load with dotenvx', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '..', '..');

  const command = "node -e \"require('./functions/index.js'); console.log(process.env.AZURE_TENANT_ID)\"";
  const output = execSync(command, { cwd: repoRoot }).toString().trim();
  const lines = output.split(/\r?\n/);
  expect(lines.at(-1)).toBe('test-tenant-id');
});
