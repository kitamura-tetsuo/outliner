import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

/** @feature ENV-0009
 *  Title   : Sequential Playwright testing documented
 *  Source  : docs/dev-features/env-sequential-playwright-testing-415fc760.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const readmeFile = path.join(repoRoot, 'README.md');

test('README explains sequential Playwright testing', () => {
  const content = fs.readFileSync(readmeFile, 'utf-8');
  expect(content).toMatch(/run-e2e-progress-for-codex\.sh\s+1/);
  expect(content).toMatch(/timeout/i);
});
