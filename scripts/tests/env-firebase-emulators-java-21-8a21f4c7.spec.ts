/** @feature ENV-8a21f4c7
 *  Title   : Firebase emulators use Java 21+
 *  Source  : docs/dev-features/env-firebase-emulators-java-21-8a21f4c7.yaml
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function fakeJava(version: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-java-"));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, "java"), `#!/bin/sh\necho 'openjdk version "${version}"' >&2\n`);
    fs.chmodSync(path.join(directory, "java"), 0o755);
    return directory;
}

test("both devcontainers expose the maintained Temurin 21 runtime", () => {
    for (const name of ["Dockerfile", "Dockerfile.override"]) {
        const dockerfile = fs.readFileSync(path.join(repoRoot, ".devcontainer", name), "utf8");
        expect(dockerfile).toContain("FROM eclipse-temurin:21-jre-noble AS java-runtime");
        expect(dockerfile).toContain("COPY --from=java-runtime /opt/java/openjdk /opt/java/openjdk");
        expect(dockerfile).toContain("ENV JAVA_HOME=/opt/java/openjdk");
        expect(dockerfile).toContain("java.specification.version");
        expect(dockerfile).not.toMatch(/^\s*default-jre\s*\\/m);
    }
});

test("Java preflight accepts 21+ and promptly rejects Java 17", () => {
    const preflight = path.join(repoRoot, "scripts/require-java-21.sh");
    const accepted = execFileSync(preflight, {
        env: { ...process.env, PATH: `${fakeJava("21.0.8")}:${process.env.PATH}` },
        encoding: "utf8",
    });
    expect(accepted).toContain("Java 21 satisfies");

    const rejected = spawnSync(preflight, {
        env: { ...process.env, PATH: `${fakeJava("17.0.15")}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 2_000,
    });
    expect(rejected.status).toBe(1);
    expect(rejected.signal).toBeNull();
    expect(rejected.stderr).toContain("require Java 21 or newer; found Java 17");

    const setupRejected = spawnSync(path.join(repoRoot, "scripts/setup.sh"), {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeJava("17.0.15")}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 2_000,
    });
    expect(setupRejected.status).toBe(1);
    expect(setupRejected.signal).toBeNull();
    expect(setupRejected.stderr.match(/require Java 21 or newer/g)).toHaveLength(1);
    expect(setupRejected.stdout).not.toContain("Retrying");
});

test("setup and the emulator production entrypoint enforce preflight", () => {
    const setup = fs.readFileSync(path.join(repoRoot, "scripts/setup.sh"), "utf8");
    const startup = fs.readFileSync(path.join(repoRoot, "scripts/start-firebase-emulators.sh"), "utf8");
    const common = fs.readFileSync(path.join(repoRoot, "scripts/common-functions.sh"), "utf8");

    expect(setup).toContain('"${SCRIPT_DIR}/require-java-21.sh"');
    expect(setup.indexOf('"${SCRIPT_DIR}/require-java-21.sh"')).toBeLessThan(setup.indexOf("trap 'handle_error"));
    expect(startup).toContain('"${SCRIPT_DIR}/require-java-21.sh"');
    expect(startup).toContain("--only auth,firestore,functions,hosting,storage");
    expect(common).not.toContain("21.0.6");
    expect(common).not.toContain("temurin21-binaries/releases/download");
});

test("the production entrypoint launches every required emulator after Java preflight", () => {
    const binDirectory = fakeJava("21.0.8");
    const invocationFile = path.join(binDirectory, "firebase-invocation");
    fs.writeFileSync(
        path.join(binDirectory, "firebase"),
        `#!/bin/sh\nprintf '%s\\n' "$*" >> "${invocationFile}"\n`,
    );
    fs.chmodSync(path.join(binDirectory, "firebase"), 0o755);

    const result = spawnSync(path.join(repoRoot, "scripts/start-firebase-emulators.sh"), {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH}` },
        encoding: "utf8",
        timeout: 2_000,
    });

    expect(result.status).toBe(0);
    const invocations = fs.readFileSync(invocationFile, "utf8");
    expect(invocations).toContain("--version");
    expect(invocations).toContain("emulators:start --only auth,firestore,functions,hosting,storage");
    expect(invocations).toContain("--config firebase.emulator.json --project outliner-d57b0");
});
