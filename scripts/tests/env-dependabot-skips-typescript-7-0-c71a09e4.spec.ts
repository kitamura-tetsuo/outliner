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

/**
 * The npm directories share one `updates` entry so that a bump applied to
 * several lockfiles arrives as a single pull request, so the TypeScript ignore
 * lives in that one entry rather than once per directory.
 */
function npmEntry(): string {
    const marker = "  - package-ecosystem: 'npm'";
    const start = dependabot.indexOf(marker);
    expect(start, "missing Dependabot npm entry").toBeGreaterThanOrEqual(0);

    const next = dependabot.indexOf("\n  - package-ecosystem:", start + marker.length);
    return dependabot.slice(start, next === -1 ? undefined : next);
}

const typescriptDirectories = ["/client", "/server"];
const typescriptFreeDirectories = ["/", "/functions", "/scripts", "/scripts/tests"];

test("the npm entry covers every directory in the repository", () => {
    const entry = npmEntry();

    for (const directory of [...typescriptDirectories, ...typescriptFreeDirectories]) {
        expect(entry).toContain(`      - '${directory}'`);
    }
});

test("the npm entry rejects the TypeScript 7.0 release line", () => {
    const entry = npmEntry();

    expect(entry).toContain("      - dependency-name: 'typescript'");
    expect(entry).toContain("          - '>=7.0.0 <7.1.0'");
});

test("Dependabot may resume at TypeScript 7.1", () => {
    const entry = npmEntry();

    // A semver-major ignore would also suppress 7.1 and every later 7.x release.
    expect(entry).not.toContain("version-update:semver-major");
    expect(entry).not.toMatch(/versions:\s*\n\s*- ["']?(?:>=)?7(?:\.x)?["']?\s*$/m);
});

test("the exception only reaches packages that currently depend on TypeScript", () => {
    // The ignore is written once for the whole entry, so what keeps it narrow is
    // that no other workspace declares TypeScript. Should one start to, this
    // test fails and the ignore has to be reconsidered for that workspace.
    const declaredTypescript = (directory: string) => {
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, directory, "package.json"), "utf8"));
        return { ...pkg.dependencies, ...pkg.devDependencies }.typescript;
    };

    for (const directory of typescriptDirectories) {
        expect(declaredTypescript(directory), `${directory} should declare TypeScript`).toBeDefined();
    }

    for (const directory of typescriptFreeDirectories) {
        expect(declaredTypescript(directory), `${directory} should not declare TypeScript`).toBeUndefined();
    }
});
