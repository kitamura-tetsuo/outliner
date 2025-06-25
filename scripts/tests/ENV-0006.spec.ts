import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

/** @feature ENV-0006
 *  Title   : Consolidate emulator host variables
 *  Source  : docs/dev-features.yaml
 */

test('emulator host variables are consolidated', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, '../..');

  const clientEnv = fs.readFileSync(path.join(repoRoot, 'client/.env.test'), 'utf-8');
  expect(clientEnv.includes('VITE_AUTH_EMULATOR_PORT')).toBe(false);
  expect(clientEnv.includes('VITE_FIRESTORE_EMULATOR_PORT')).toBe(false);
  expect(clientEnv).toMatch(/VITE_AUTH_EMULATOR_HOST=.*:\d+/);
  expect(clientEnv).toMatch(/VITE_FIRESTORE_EMULATOR_HOST=.*:\d+/);

  const serverEnv = fs.readFileSync(path.join(repoRoot, 'server/.env.test'), 'utf-8');
  expect(/^AUTH_EMULATOR_HOST=/m.test(serverEnv)).toBe(false);
  expect(serverEnv.includes('FIREBASE_EMULATOR_HOST')).toBe(false);
  expect(serverEnv).toMatch(/FIREBASE_AUTH_EMULATOR_HOST=.*:\d+/);
  expect(serverEnv).toMatch(/FIRESTORE_EMULATOR_HOST=.*:\d+/);
});
