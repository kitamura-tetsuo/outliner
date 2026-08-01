import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/** @feature ENV-060bbae6
 *  Title   : dprint CLI and plugins come from pinned npm devDependencies
 *  Source  : docs/dev-features/env-dprint-plugins-from-npm-060bbae6.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf-8");
const readJson = <T>(relative: string) => JSON.parse(read(relative)) as T;

const rootPackage = readJson<{ devDependencies: Record<string, string>; }>("package.json");
const configs = ["dprint.json", "functions/dprint.json"];

/** node_modules-relative plugin paths, e.g. ./node_modules/@dprint/json/plugin.wasm */
const pluginPaths = (relative: string) => readJson<{ plugins: string[]; }>(relative).plugins;

/** @dprint/json  <-  ./node_modules/@dprint/json/plugin.wasm */
const packageOf = (plugin: string) => plugin.replace(/^.*?node_modules\//, "").replace(/\/plugin\.wasm$/, "");

describe("dprint plugins are npm devDependencies", () => {
    test.each(configs)("%s resolves every plugin out of node_modules", relative => {
        const plugins = pluginPaths(relative);
        expect(plugins.length).toBeGreaterThan(0);
        // functions/dprint.json sits one level down, so it reaches up to the root.
        const prefix = relative.includes("/") ? "../node_modules/" : "./node_modules/";
        for (const plugin of plugins) {
            expect(plugin.startsWith(prefix), `${relative}: ${plugin} must come from the root node_modules`).toBe(true);
            expect(plugin, `${relative}: ${plugin} must not be fetched over the network`).not.toMatch(/^https?:/);
        }
    });

    test.each(configs)("%s only names packages pinned in the root package.json", relative => {
        for (const plugin of pluginPaths(relative)) {
            const pkg = packageOf(plugin);
            expect(rootPackage.devDependencies, `${pkg} is not a root devDependency`).toHaveProperty(pkg);
        }
    });

    test("the CLI and every plugin are pinned to an exact version", () => {
        const pinned = ["dprint", ...configs.flatMap(relative => pluginPaths(relative).map(packageOf))];
        for (const pkg of new Set(pinned)) {
            const range = rootPackage.devDependencies[pkg];
            expect(range, `${pkg} must be a root devDependency`).toBeDefined();
            // A range like ^0.95.5 would let a lockfile refresh change formatting.
            expect(range, `${pkg} must be exact-pinned, got ${range}`).toMatch(/^\d+\.\d+\.\d+$/);
        }
    });

    test("package-lock.json carries an integrity hash for every plugin", () => {
        const lock = readJson<{ packages: Record<string, { integrity?: string; }>; }>("package-lock.json");
        for (const relative of configs) {
            for (const plugin of pluginPaths(relative)) {
                const entry = lock.packages[`node_modules/${packageOf(plugin)}`];
                expect(entry, `${packageOf(plugin)} is missing from package-lock.json`).toBeDefined();
                expect(entry.integrity, `${packageOf(plugin)} has no integrity hash`).toMatch(/^sha\d{3}-/);
            }
        }
    });

    test("the wasm files the configs point at are really there", () => {
        for (const relative of configs) {
            const configDir = path.dirname(path.join(repoRoot, relative));
            for (const plugin of pluginPaths(relative)) {
                const resolved = path.resolve(configDir, plugin);
                expect(fs.existsSync(resolved), `${relative}: missing ${plugin} (run npm ci)`).toBe(true);
                // A wasm module starts with the magic bytes 0x00 'a' 's' 'm'.
                const magic = fs.readFileSync(resolved).subarray(0, 4);
                expect([...magic], `${plugin} is not a wasm module`).toEqual([0x00, 0x61, 0x73, 0x6d]);
            }
        }
    });

    test("functions/ shares the root typescript plugin instead of pinning its own", () => {
        const pick = (relative: string) => pluginPaths(relative).find(plugin => plugin.includes("typescript"));
        expect(packageOf(pick("functions/dprint.json")!)).toBe(packageOf(pick("dprint.json")!));
    });
});

describe("nothing vendors the plugins anymore", () => {
    test("no Git LFS tracking remains", () => {
        expect(fs.existsSync(path.join(repoRoot, ".gitattributes"))).toBe(false);
        expect(fs.existsSync(path.join(repoRoot, "dprint-plugins"))).toBe(false);
    });

    test("no workflow checks out LFS objects", () => {
        const dir = path.join(repoRoot, ".github", "workflows");
        for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".yml"))) {
            const content = fs.readFileSync(path.join(dir, file), "utf-8");
            expect(content, `${file} still enables Git LFS`).not.toMatch(/lfs:\s*true/);
            expect(content, `${file} still pushes Git LFS objects`).not.toMatch(/git lfs push/);
        }
    });

    test("workflows that run dprint install the root dependencies", () => {
        for (const file of ["ci-format.yml", "ci-eslint.yml"]) {
            const content = read(path.join(".github", "workflows", file));
            expect(content, `${file} must run npm ci at the repository root`).toMatch(
                /- name: Install [^\n]*\n\s+run: npm ci/,
            );
            // A global install would ignore the version pinned in package.json.
            expect(content, `${file} must not install dprint globally`).not.toMatch(/npm install -g dprint/);
        }
    });

    test("the guard script installs the root dependencies rather than downloading", () => {
        const script = read("scripts/ensure-dprint-plugins.sh");
        expect(script).toMatch(/npm ci/);
        expect(script, "no plugin should be downloaded from the CDN").not.toMatch(/plugins\.dprint\.dev\/[\w-]+\.wasm/);
        expect(script, "Git LFS recovery is gone").not.toMatch(/git lfs pull|skip-worktree/);
    });

    test("formatting commands use the pinned local CLI, not a floating npx download", () => {
        for (const file of ["scripts/check_format.sh", "scripts/pre_push.sh", "scripts/test.sh"]) {
            expect(read(file), `${file} must not run npx --yes dprint`).not.toMatch(/npx --yes dprint/);
        }
    });
});
