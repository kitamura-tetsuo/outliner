import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-3e6b41c7
 *  Title   : CI builds the server container images on every pull request
 *  Source  : docs/dev-features/env-ci-docker-image-build-3e6b41c7.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const read = (...segments: string[]) => fs.readFileSync(path.join(repoRoot, ...segments), "utf-8");

test("a dedicated workflow builds both server images without pushing", () => {
    const workflow = read(".github", "workflows", "ci-docker-build.yml");

    expect(workflow).toMatch(/workflow_call:/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/file: \.\/server\/Dockerfile\b/);
    expect(workflow).toMatch(/file: \.\/server\/Dockerfile\.debug\b/);

    // Publishing stays the job of build-server.yml; CI must only build.
    expect(workflow).toMatch(/push: false/);
    expect(workflow).not.toMatch(/push: true/);

    // The repo root is the build context: the server co-compiles ../shared.
    expect(workflow).toMatch(/context: \./);
});

test("the built server image is exercised so native modules must load", () => {
    const workflow = read(".github", "workflows", "ci-docker-build.yml");

    // A green `docker build` does not prove better-sqlite3's compiled binding
    // loads, so the image is loaded locally and actually run.
    expect(workflow).toMatch(/load: true/);
    expect(workflow).toMatch(/docker run --rm .*yjs-ws-server:ci/);
    expect(workflow).toMatch(/require\('better-sqlite3'\)/);
});

test("the CI entry workflow calls the docker build workflow on pull requests", () => {
    const ci = read(".github", "workflows", "ci.yml");

    expect(ci).toMatch(/uses: \.\/\.github\/workflows\/ci-docker-build\.yml/);
    expect(ci).toMatch(/pull_request:/);
});

test("the server images install the node-gyp toolchain better-sqlite3 needs", () => {
    // better-sqlite3 ships no prebuilt binary for the slim images' Node build,
    // so npm ci compiles it and fails without python3/make/g++.
    for (const dockerfile of ["Dockerfile", "Dockerfile.debug"]) {
        const contents = read("server", dockerfile);
        expect(contents).toMatch(/apt-get install -y --no-install-recommends python3 make g\+\+/);
    }

    // The runtime image must not keep the toolchain around.
    expect(read("server", "Dockerfile")).toMatch(/apt-get purge -y --auto-remove python3 make g\+\+/);
});
