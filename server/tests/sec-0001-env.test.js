const { describe, it } = require('mocha');
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

/** @feature SEC-0001 */
describe('Dotenvx encrypted env files (SEC-0001)', function () {
  it('all environment variables are encrypted', function () {
    const envPath = path.resolve(__dirname, '../.env.development');
    const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    const envLines = lines.filter(
      (line) => line.trim() && !line.startsWith('#') && !line.startsWith('DOTENV_PUBLIC_KEY')
    );
    envLines.forEach((line) => {
      const idx = line.indexOf('=');
      expect(idx).to.be.greaterThan(-1);
      const value = line.slice(idx + 1).replace(/^"|"$/g, '');
      expect(value.startsWith('encrypted:'), `${line} should start with encrypted:`).to.be
        .true;
    });
  });
});
