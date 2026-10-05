import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];
const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "client/package-lock.json"), "utf8"));

function run(cwd: string, command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
    return spawnSync(command, args, {
        cwd,
        encoding: "utf8",
        timeout: 60000,
        env: { ...process.env, npm_config_prefer_offline: "true", ...extraEnv },
    });
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-lint-dependencies-"));
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, "scripts"));
    const client = path.join(root, "client");
    fs.mkdirSync(client);
    fs.copyFileSync(
        path.join(repoRoot, "scripts/ensure-client-lint-dependencies.sh"),
        path.join(root, "scripts/ensure-client-lint-dependencies.sh"),
    );
    const devDependencies = Object.fromEntries(
        ["stylelint", "eslint", "stylelint-config-standard"].map(name => [
            name,
            lock.packages[`node_modules/${name}`].version,
        ]),
    );
    fs.writeFileSync(
        path.join(client, "package.json"),
        JSON.stringify({
            private: true,
            scripts: { lint: "stylelint sample.css" },
            devDependencies,
        }),
    );
    fs.writeFileSync(
        path.join(client, ".stylelintrc.json"),
        JSON.stringify({
            extends: "stylelint-config-standard",
        }),
    );
    fs.writeFileSync(path.join(client, "sample.css"), "a { color: red; }\n");
    const result = run(client, "npm", [
        "install",
        "--package-lock-only",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
    ]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return { root, client };
}

function prepare(root: string, extraEnv: NodeJS.ProcessEnv = {}) {
    return run(root, "bash", ["scripts/ensure-client-lint-dependencies.sh"], extraEnv);
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test("a fresh production environment installs real lint tools and enforces CSS rules", () => {
    const { root, client } = fixture();
    const before = fs.readFileSync(path.join(client, "package-lock.json"), "utf8");
    const result = prepare(root, { NODE_ENV: "production", npm_config_omit: "dev" });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.readFileSync(path.join(client, "package-lock.json"), "utf8")).toBe(before);
    const valid = run(client, "npm", ["run", "lint"]);
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    fs.writeFileSync(path.join(client, "sample.css"), "a { color: invalid-color; }\n");
    const invalid = run(client, "npm", ["run", "lint"]);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout + invalid.stderr).toContain("declaration-property-value-no-unknown");
    const repeat = prepare(root, { npm_config_registry: "http://127.0.0.1:1", npm_config_offline: "false" });
    expect(repeat.status, repeat.stdout + repeat.stderr).toBe(0);
    expect(repeat.stdout).toBe("");
}, 120000);

test("an incomplete existing dependency tree is repaired without clearing cached artifacts", () => {
    const { root, client } = fixture();
    fs.mkdirSync(path.join(client, "node_modules/.cache"), { recursive: true });
    const marker = path.join(client, "node_modules/.cache", "existing-output.txt");
    fs.writeFileSync(marker, "preserve this file\n");
    const result = prepare(root);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fs.readFileSync(marker, "utf8")).toBe("preserve this file\n");
    const lint = run(client, "npm", ["run", "lint"]);
    expect(lint.status, lint.stdout + lint.stderr).toBe(0);
    fs.rmSync(path.join(client, "node_modules/stylelint-config-standard"), { recursive: true });
    fs.unlinkSync(path.join(client, "node_modules/.bin/eslint"));
    const repair = prepare(root);
    expect(repair.status, repair.stdout + repair.stderr).toBe(0);
    expect(fs.existsSync(path.join(client, "node_modules/.bin/eslint"))).toBe(true);
    const repairedLint = run(client, "npm", ["run", "lint"]);
    expect(repairedLint.status, repairedLint.stdout + repairedLint.stderr).toBe(0);
}, 120000);

test("installation failure stops preparation rather than reporting success", () => {
    const { root, client } = fixture();
    fs.unlinkSync(path.join(client, "package-lock.json"));
    const result = prepare(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("npm ci");
    expect(fs.existsSync(path.join(client, "node_modules/.bin/stylelint"))).toBe(false);
});

test("test.sh prepares lint dependencies before optional formatting and test dispatch", () => {
    const script = fs.readFileSync(path.join(repoRoot, "scripts/test.sh"), "utf8");
    const preparation = script.indexOf('bash "${SCRIPT_DIR}/ensure-client-lint-dependencies.sh"');
    expect(preparation).toBeGreaterThan(-1);
    expect(preparation).toBeLessThan(script.indexOf('if [ "${SKIP_DPRINT:-0}"'));
    expect(preparation).toBeLessThan(script.indexOf("if [ $# -eq 0 ]"));
});
