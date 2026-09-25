/**
 * Disposable Git fixtures for the Playwright image publisher.
 *
 * Every repository lives under a fresh temporary directory with an isolated Git
 * configuration, so the working repository's HEAD, index, config and files are
 * never touched. The fixture's base commit carries copies of the real
 * production scripts, and the runner is a shallow, detached checkout of the
 * synthetic merge ref -- the same shape actions/checkout gives a pull_request
 * run -- so the workflow step executes the production code path unchanged.
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { callInputs, type Context, runJobSync } from "./workflow-harness";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const REAL_GIT = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf-8" }).trim();
const PRODUCTION_FILES = [
    "scripts/ci/github-rest.mjs",
    "scripts/ci/pr-guards.sh",
    "scripts/ci/request-corrected-head-ci.mjs",
    "scripts/ci/resolve-pr-context.mjs",
    "scripts/publish-playwright-sync.mjs",
    "scripts/playwright-version-sync-lib.mjs",
    "scripts/sync-playwright-version.mjs",
    "scripts/check-playwright-version.mjs",
    "scripts/common-functions.sh",
];
export const DOCKERFILE = ".github/container/Dockerfile";
export const MANIFESTS = ["package.json", "package-lock.json", "client/package.json", "client/package-lock.json"];

export function makeTmp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-sync-"));
    fs.writeFileSync(path.join(dir, "gitconfig"), "[init]\n\tdefaultBranch = main\n");
    return dir;
}

export const gitEnv = (tmp: string, extra: Record<string, string> = {}) => ({
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(tmp, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.com",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.com",
    ...extra,
});

export function git(tmp: string, cwd: string, ...args: string[]): string {
    return execFileSync(REAL_GIT, args, { cwd, env: gitEnv(tmp), encoding: "utf-8" }).trim();
}

export function lockfile(test: string, runner = test, core = runner) {
    return JSON.stringify(
        {
            name: "client",
            lockfileVersion: 3,
            packages: {
                "": { name: "client" },
                "node_modules/@playwright/test": { version: test },
                "node_modules/playwright": { version: runner },
                "node_modules/playwright-core": { version: core },
            },
        },
        null,
        4,
    ) + "\n";
}

export const dockerfile = (version: string) =>
    fs.readFileSync(path.join(repoRoot, DOCKERFILE), "utf-8")
        .replace(/^FROM mcr\.microsoft\.com\/playwright:v\S+$/m, `FROM mcr.microsoft.com/playwright:v${version}-jammy`);

export function writeFiles(dir: string, files: Record<string, string | undefined>) {
    for (const [file, content] of Object.entries(files)) {
        const target = path.join(dir, file);
        if (content === undefined) {
            fs.rmSync(target, { force: true });
            continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

export function commitAll(tmp: string, dir: string, message: string, files: Record<string, string | undefined>) {
    writeFiles(dir, files);
    git(tmp, dir, "add", "-A");
    git(tmp, dir, "commit", "-q", "-m", message);
    return git(tmp, dir, "rev-parse", "HEAD");
}

export interface Fixture {
    tmp: string;
    remote: string;
    seed: string;
    branch: string;
    prNumber: number;
    H: string;
    /** main after its base-only commit, and refs/pull/<n>/merge. */
    base: string;
    merge: string;
}

/**
 * A bare remote with `main` (plus a base-only sentinel commit absent from H),
 * the PR source branch at H, and refs/pull/<n>/merge combining the two.
 */
export function createFixture(
    opts: { branch: string; prNumber: number; lock: string; image: string; files?: Record<string, string>; },
): Fixture {
    const tmp = makeTmp();
    const remote = path.join(tmp, "remote.git");
    const seed = path.join(tmp, "seed");
    git(tmp, tmp, "init", "-q", "--bare", remote);
    git(tmp, tmp, "init", "-q", seed);
    git(tmp, seed, "remote", "add", "origin", remote);

    const base: Record<string, string> = {
        "package.json": '{\n    "name": "root"\n}\n',
        "package-lock.json": '{\n    "name": "root",\n    "lockfileVersion": 3\n}\n',
        "client/package.json": '{\n    "name": "client"\n}\n',
        "client/package-lock.json": lockfile("1.0.0"),
        [DOCKERFILE]: dockerfile("1.0.0"),
    };
    for (const file of PRODUCTION_FILES) base[file] = fs.readFileSync(path.join(repoRoot, file), "utf-8");
    commitAll(tmp, seed, "base", base);

    git(tmp, seed, "checkout", "-q", "-b", opts.branch);
    const H = commitAll(tmp, seed, "bump playwright", {
        "client/package-lock.json": opts.lock,
        [DOCKERFILE]: dockerfile(opts.image),
        ...opts.files,
    });
    git(tmp, seed, "checkout", "-q", "main");
    commitAll(tmp, seed, "base-only change", { "BASE_SENTINEL.txt": "only on main\n" });
    git(tmp, seed, "checkout", "-q", "--detach", "main");
    git(tmp, seed, "merge", "-q", "--no-ff", "-m", `Merge ${H} into main`, H);
    const merge = git(tmp, seed, "rev-parse", "HEAD");
    git(tmp, seed, "push", "-q", "origin", "main", opts.branch, `${merge}:refs/pull/${opts.prNumber}/merge`);
    git(tmp, seed, "checkout", "-q", "main");
    const baseSha = git(tmp, seed, "rev-parse", "main");
    return { tmp, remote, seed, branch: opts.branch, prNumber: opts.prNumber, H, base: baseSha, merge };
}

/** A clone shaped like actions/checkout on pull_request: shallow, detached at the merge ref. */
export function runnerCheckout(fx: Fixture, name = "runner"): string {
    const dir = path.join(fx.tmp, name);
    git(fx.tmp, fx.tmp, "init", "-q", dir);
    git(fx.tmp, dir, "remote", "add", "origin", fx.remote);
    const ref = `refs/remotes/pull/${fx.prNumber}/merge`;
    git(fx.tmp, dir, "fetch", "-q", "--no-tags", "--depth=1", "origin", `+refs/pull/${fx.prNumber}/merge:${ref}`);
    git(fx.tmp, dir, "checkout", "-q", "--force", ref);
    return dir;
}

/** Every ref on the remote, keyed by name. */
export function remoteRefs(fx: Fixture): Record<string, string> {
    const out = git(fx.tmp, fx.tmp, "--git-dir", fx.remote, "for-each-ref", "--format=%(refname) %(objectname)");
    return Object.fromEntries(out.split("\n").filter(Boolean).map((l) => l.split(" ")));
}

/** The `github` context of a pull_request run for the fixture's PR. */
export function prEvent(
    fx: Fixture,
    opts: { sha?: string; author?: string; headRepo?: string; labels?: string[]; apiUrl?: string; } = {},
): Context {
    return {
        repository: "example/outliner",
        event_name: "pull_request",
        actor: opts.author ?? "octocat",
        ref: `refs/pull/${fx.prNumber}/merge`,
        sha: fx.merge,
        api_url: opts.apiUrl ?? "http://127.0.0.1:9/unused",
        event: {
            pull_request: {
                number: fx.prNumber,
                user: { login: opts.author ?? "octocat" },
                head: {
                    ref: fx.branch,
                    sha: opts.sha ?? fx.H,
                    repo: { full_name: opts.headRepo ?? "example/outliner" },
                },
                base: { ref: "main", sha: fx.base },
                labels: (opts.labels ?? []).map((name) => ({ name })),
            },
        },
    };
}

/** Wraps git so the test can observe (and, with `beforePush`, contest) the publisher's push. */
export function gitShim(fx: Fixture, beforePush = "") {
    const bin = path.join(fx.tmp, "bin");
    const log = path.join(fx.tmp, "push.log");
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(fx.tmp, "before-push.sh"), `set -e\n${beforePush}\n`);
    fs.writeFileSync(
        path.join(bin, "git"),
        `#!/bin/bash\nif [ "$1" = push ]; then\n  printf '%s\\n' "$*" >> "${log}"\n`
            + `  bash "${fx.tmp}/before-push.sh" || exit 97\nfi\nexec "${REAL_GIT}" "$@"\n`,
        { mode: 0o755 },
    );
    return {
        PATH: `${bin}:${process.env.PATH}`,
        pushes: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8") : ""),
    };
}

/**
 * Runs one step of the playwright-version job the way CI reaches it: the PR
 * context is resolved by the real PR Guards `context` job, passed through
 * ci.yml's `with:` into ci-playwright-version.yml, and the step's `if`, `env`
 * and `run` are evaluated from the workflow file. `extraEnv` is applied last,
 * so a test can also stand in for a misconfigured caller.
 */
export function runStep(name: string, cwd: string, github: Context, extraEnv: Record<string, string> = {}) {
    const env = gitEnv(path.dirname(cwd));
    const guards = runJobSync(
        "ci-pr-guards.yml",
        "context",
        { github, inputs: callInputs("ci.yml", "pr-guards", { github, inputs: github.inputs ?? {} }) },
        cwd,
        env,
    );
    if (guards.failed) throw new Error(`PR context rejected: ${guards.steps.map((s) => s.output).join("")}`);
    const inputs = callInputs("ci.yml", "playwright-version", {
        github,
        needs: { "pr-guards": { outputs: guards.outputs } },
    });
    const job = runJobSync(
        "ci-playwright-version.yml",
        "playwright-version",
        { github, inputs, secrets: { GITHUB_TOKEN: "unused" } },
        cwd,
        env,
        { only: name, stepEnv: { [name]: extraEnv } },
    );
    const step = job.step(name);
    return {
        skipped: step.skipped,
        status: step.skipped ? 0 : step.status,
        output: step.output,
        outputs: step.outputs,
    };
}

export const PUBLISH = "Publish the Playwright image correction to the PR source branch";
export const CHECK = "Check the test container matches the client's Playwright version";
