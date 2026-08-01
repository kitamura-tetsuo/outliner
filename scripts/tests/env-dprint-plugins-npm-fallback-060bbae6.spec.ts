import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vitest";

/** @feature ENV-060bbae6
 *  Title   : dprint plugins restored from npm when the plugin CDN is blocked
 *  Source  : docs/dev-features/env-dprint-plugins-npm-fallback-060bbae6.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf-8");
const readJson = (relative: string) => JSON.parse(read(relative)) as { plugins: string[]; };

const script = read("scripts/ensure-dprint-plugins.sh");

/** Parse the `name|npm-spec|url` rows of the PLUGIN_SOURCES array. */
const pluginSources = (): { file: string; spec: string; url: string; }[] => {
    const block = script.match(/PLUGIN_SOURCES=\(([\s\S]*?)\n\)/);
    expect(block, "PLUGIN_SOURCES array is missing").not.toBeNull();
    return block![1]
        .split("\n")
        .map(line => line.trim().replace(/^"|"$/g, ""))
        .filter(line => line.length > 0 && !line.startsWith("#"))
        .map(line => {
            const [file, spec, url] = line.split("|");
            return { file, spec, url };
        });
};

describe("ensure-dprint-plugins.sh recovery sources", () => {
    test("declares an npm package for every plugin", () => {
        const sources = pluginSources();
        expect(sources.length).toBeGreaterThan(0);
        for (const { file, spec, url } of sources) {
            expect(file, `${file} must be a wasm file name`).toMatch(/\.wasm$/);
            expect(spec, `${file} must name a pinned npm package`).toMatch(/^@?[\w./-]+@\d+\.\d+\.\d+$/);
            expect(url, `${file} must keep its CDN url as the last resort`).toMatch(
                /^https:\/\/plugins\.dprint\.dev\//,
            );
        }
    });

    test("pins each npm package to the version baked into the wasm file name", () => {
        for (const { file, spec } of pluginSources()) {
            // typescript-0.95.5.wasm / malva-v0.11.2.wasm -> 0.95.5 / 0.11.2
            const fileVersion = file.match(/-v?(\d+\.\d+\.\d+)\.wasm$/)?.[1];
            const specVersion = spec.split("@").pop();
            expect(fileVersion, `cannot read a version out of ${file}`).toBeDefined();
            expect(specVersion, `${spec} must resolve to the bytes named by ${file}`).toBe(fileVersion);
        }
    });

    test("tries git lfs, then npm, then the CDN", () => {
        const lfsAt = script.indexOf("git lfs pull");
        const npmAt = script.indexOf("npm pack");
        const cdnAt = script.indexOf("Falling back to downloading the plugins from plugins.dprint.dev");
        expect(lfsAt).toBeGreaterThan(-1);
        expect(npmAt).toBeGreaterThan(lfsAt);
        expect(cdnAt).toBeGreaterThan(npmAt);
    });

    test("extracts the npm tarball without installing into the repository", () => {
        expect(script).toMatch(/npm pack "\$spec" --silent --pack-destination "\$npm_tmp"/);
        expect(script).toMatch(/tar -xzf "\$tarball" -C "\$npm_tmp" package\/plugin\.wasm/);
        // A bare `npm install` here would write into the repo's node_modules.
        expect(script).not.toMatch(/npm (install|ci|i) /);
    });

    test("a failed CDN download cannot destroy the checked-out LFS pointer", () => {
        // `curl -o <dest>` truncates <dest> before it knows the request failed,
        // so the download must land on a temp path and only then be moved.
        expect(script).toMatch(/curl -fsSL -o "\$\{PLUGIN_DIR\}\/\$\{name\}\.tmp"/);
        expect(script).toMatch(/mv "\$\{PLUGIN_DIR\}\/\$\{name\}\.tmp" "\$\{PLUGIN_DIR\}\/\$\{name\}"/);
    });

    test("keeps restored binaries out of the index when Git LFS is unusable", () => {
        expect(script).toMatch(/git update-index --skip-worktree "dprint-plugins\/\$\{name\}"/);
    });
});

describe("dprint configs resolve plugins locally", () => {
    const configs = ["dprint.json", "functions/dprint.json"];

    test.each(configs)("%s references no remote plugin url", relative => {
        for (const plugin of readJson(relative).plugins) {
            expect(plugin, `${relative} must not fetch ${plugin} over the network`).not.toMatch(/^https?:/);
        }
    });

    test.each(configs)("%s points at wasm files that exist", relative => {
        const configDir = path.dirname(path.join(repoRoot, relative));
        for (const plugin of readJson(relative).plugins) {
            expect(fs.existsSync(path.resolve(configDir, plugin)), `${relative}: missing ${plugin}`).toBe(true);
        }
    });

    test.each(configs)("%s only uses plugins the recovery script can restore", relative => {
        const known = new Set(pluginSources().map(source => source.file));
        for (const plugin of readJson(relative).plugins) {
            expect(known, `${path.basename(plugin)} is absent from PLUGIN_SOURCES`).toContain(path.basename(plugin));
        }
    });

    test("functions/ shares the root typescript plugin instead of pinning an older one", () => {
        const rootTs = readJson("dprint.json").plugins.find(plugin => plugin.includes("typescript"));
        const functionsTs = readJson("functions/dprint.json").plugins.find(plugin => plugin.includes("typescript"));
        expect(functionsTs).toBeDefined();
        expect(path.basename(functionsTs!)).toBe(path.basename(rootTs!));
    });
});
