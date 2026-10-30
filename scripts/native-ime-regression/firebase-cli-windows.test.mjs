import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Windows Firebase wrapper verifies and launches the resolved JavaScript CLI", {
    skip: process.platform !== "win32",
}, () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-cli-windows-"));
    const scripts = path.join(fixture, "scripts");
    const prefix = path.join(fixture, "npm-prefix");
    const entry = path.join(prefix, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
    const invocation = path.join(fixture, "invocation.json");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.copyFileSync(path.join(repository, "scripts", "firebase-cli.cmd"), path.join(scripts, "firebase-cli.cmd"));
    fs.copyFileSync(
        path.join(repository, "scripts", "firebase-cli-windows.cjs"),
        path.join(scripts, "firebase-cli-windows.cjs"),
    );
    fs.writeFileSync(path.join(fixture, ".firebase-tools-version"), "15.22.1\n");
    fs.writeFileSync(path.join(prefix, "firebase.cmd"), "@echo off\r\nexit /b 99\r\n");

    const writeEntry = (version) =>
        fs.writeFileSync(
            entry,
            `const fs=require("node:fs");
if(process.argv[2]==="--version"){console.log(${JSON.stringify(version)});process.exit(0)}
fs.writeFileSync(process.env.FIREBASE_INVOCATION,JSON.stringify(process.argv.slice(2)));
`,
        );
    writeEntry("15.22.1");

    const environment = { ...process.env, PATH: `${prefix};${process.env.PATH}`, FIREBASE_INVOCATION: invocation };
    const wrapper = path.join(scripts, "firebase-cli.cmd");
    const success = spawnSync(wrapper, ["emulators:start", "--project", "demo-project"], {
        cwd: fixture,
        env: environment,
        encoding: "utf8",
        shell: true,
    });
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(invocation, "utf8")), ["emulators:start", "--project", "demo-project"]);

    writeEntry("0.0.0");
    const mismatch = spawnSync(wrapper, ["--version"], {
        cwd: fixture,
        env: environment,
        encoding: "utf8",
        shell: true,
    });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /policy requires 15\.22\.1, but PATH resolves 0\.0\.0/);
});
