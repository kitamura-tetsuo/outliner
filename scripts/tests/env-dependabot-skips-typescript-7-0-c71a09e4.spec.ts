import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-c71a09e4
 *  Title   : Dependabot skips TypeScript 7.0 only
 *  Source  : docs/dev-features/env-dependabot-skips-typescript-7-0-c71a09e4.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const dependabot = fs.readFileSync(path.join(repoRoot, ".github", "dependabot.yml"), "utf8");

function npmDirectoryBlock(directory: string): string {
    const marker = `  - package-ecosystem: 'npm'\n    directory: '${directory}'`;
    const start = dependabot.indexOf(marker);
    expect(start, `missing Dependabot npm entry for ${directory}`).toBeGreaterThanOrEqual(0);

    const next = dependabot.indexOf("\n  - package-ecosystem:", start + marker.length);
    return dependabot.slice(start, next === -1 ? undefined : next);
}

test.each(["/client", "/server"])("%s rejects the TypeScript 7.0 release line", directory => {
    const block = npmDirectoryBlock(directory);

    expect(block).toContain('      - dependency-name: "typescript"');
    expect(block).toContain('          - ">=7.0.0 <7.1.0"');
});

test.each(["/client", "/server"])("%s permits Dependabot to resume at TypeScript 7.1", directory => {
    const block = npmDirectoryBlock(directory);

    // A semver-major ignore would also suppress 7.1 and every later 7.x release.
    expect(block).not.toContain("version-update:semver-major");
    expect(block).not.toMatch(/versions:\s*\n\s*- ["']?(?:>=)?7(?:\.x)?["']?\s*$/m);
});

test("the exception is limited to packages that currently depend on TypeScript", () => {
    expect(npmDirectoryBlock("/")).not.toContain('dependency-name: "typescript"');
    expect(npmDirectoryBlock("/functions")).not.toContain('dependency-name: "typescript"');
    expect(npmDirectoryBlock("/scripts")).not.toContain('dependency-name: "typescript"');
    expect(npmDirectoryBlock("/scripts/tests")).not.toContain('dependency-name: "typescript"');
});
