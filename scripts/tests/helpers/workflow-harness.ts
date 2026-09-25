/**
 * Executes the repository's real GitHub Actions workflow definitions locally.
 *
 * Workflows are parsed with a YAML parser, `${{ }}` expressions are evaluated
 * with GitHub's operator, coercion and status-function semantics, and every
 * `run:` step of a job is executed in order with bash, the way a runner would,
 * with the default GITHUB_* environment. `uses:` steps (checkout, setup-node)
 * are skipped: the test supplies the checkout directory. Reusable-workflow
 * `with:` mappings and `workflow_call` outputs are evaluated from the files as
 * well, so information passed between jobs and workflows follows the
 * production wiring rather than a test-side copy of it.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "yaml";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const workflowDir = path.join(repoRoot, ".github", "workflows");

export type Context = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

type Token = { t: "str" | "num" | "id" | "op" | "punc"; v: string; };

function tokenize(src: string): Token[] {
    const out: Token[] = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) {
            i++;
        } else if (c === "'") {
            let s = "";
            i++;
            for (;;) {
                if (i >= src.length) throw new Error(`unterminated string in ${src}`);
                if (src[i] === "'" && src[i + 1] === "'") {
                    s += "'";
                    i += 2;
                } else if (src[i] === "'") {
                    i++;
                    break;
                } else s += src[i++];
            }
            out.push({ t: "str", v: s });
        } else if (/[0-9]/.test(c)) {
            const m = /^[0-9.]+/.exec(src.slice(i))![0];
            out.push({ t: "num", v: m });
            i += m.length;
        } else if (/[A-Za-z_]/.test(c)) {
            const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(src.slice(i))![0];
            out.push({ t: "id", v: m });
            i += m.length;
        } else {
            const two = src.slice(i, i + 2);
            if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
                out.push({ t: "op", v: two });
                i += 2;
            } else if ("!<>".includes(c)) {
                out.push({ t: "op", v: c });
                i++;
            } else if ("().,[]*".includes(c)) {
                out.push({ t: "punc", v: c });
                i++;
            } else throw new Error(`unexpected ${c} in ${src}`);
        }
    }
    return out;
}

const truthy = (v: unknown) =>
    !(v === false || v === 0 || v === "" || v === null || v === undefined || Number.isNaN(v));
const toNum = (v: unknown) =>
    v === null || v === undefined
        ? 0
        : typeof v === "boolean"
        ? Number(v)
        : typeof v === "string"
        ? (v.trim() === "" ? 0 : Number(v))
        : typeof v === "number"
        ? v
        : NaN;
function looseEq(a: unknown, b: unknown) {
    a ??= null;
    b ??= null;
    if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
    if (typeof a === typeof b && (typeof a !== "object" || a === null)) return a === b;
    if (typeof a === "object" && a !== null || typeof b === "object" && b !== null) return a === b;
    return toNum(a) === toNum(b);
}
export const stringify = (v: unknown): string =>
    v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);

export interface Status {
    failed: boolean;
    cancelled: boolean;
}

function evaluateExpr(src: string, ctx: Context, status: Status = { failed: false, cancelled: false }): unknown {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (v?: string) => {
        const t = toks[p++];
        if (!t || (v !== undefined && t.v !== v)) throw new Error(`expected ${v} in ${src}`);
        return t;
    };
    const fns: Record<string, (...a: unknown[]) => unknown> = {
        format: (f, ...a) => String(f).replace(/\{(\d+)\}/g, (_, n) => stringify(a[Number(n)])),
        join: (a, sep = ",") => (Array.isArray(a) ? a.map(stringify).join(String(sep)) : stringify(a)),
        contains: (h, n) =>
            Array.isArray(h)
                ? h.some((x) => looseEq(x, n))
                : stringify(h).toLowerCase().includes(stringify(n).toLowerCase()),
        startsWith: (s, x) => stringify(s).toLowerCase().startsWith(stringify(x).toLowerCase()),
        endsWith: (s, x) => stringify(s).toLowerCase().endsWith(stringify(x).toLowerCase()),
        toJSON: (v) => JSON.stringify(v, null, 2),
        fromJSON: (v) => JSON.parse(String(v)),
        success: () => !status.failed && !status.cancelled,
        failure: () => status.failed,
        cancelled: () => status.cancelled,
        always: () => true,
    };
    function primary(): unknown {
        const t = eat();
        if (t.t === "str") return t.v;
        if (t.t === "num") return Number(t.v);
        if (t.v === "(") {
            const v = or();
            eat(")");
            return postfix(v);
        }
        if (t.v === "!") return !truthy(unary());
        if (t.t !== "id") throw new Error(`unexpected ${t.v} in ${src}`);
        if (t.v === "true") return true;
        if (t.v === "false") return false;
        if (t.v === "null") return null;
        if (peek()?.v === "(") {
            eat("(");
            const args: unknown[] = [];
            while (peek()?.v !== ")") {
                args.push(or());
                if (peek()?.v === ",") eat(",");
            }
            eat(")");
            const fn = fns[t.v];
            if (!fn) throw new Error(`unknown function ${t.v}`);
            return postfix(fn(...args));
        }
        return postfix(ctx[t.v] ?? null);
    }
    function postfix(v: unknown): unknown {
        // After `.*` the value is a list and further property access maps over it.
        let filtered = false;
        const get = (o: unknown, k: string) => (o as Record<string, unknown> | null)?.[k] ?? null;
        for (;;) {
            if (peek()?.v === ".") {
                eat(".");
                const k = eat().v;
                if (k === "*") {
                    v = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : [];
                    filtered = true;
                } else v = filtered ? (v as unknown[]).map((x) => get(x, k)) : get(v, k);
            } else if (peek()?.v === "[") {
                eat("[");
                const k = or();
                eat("]");
                v = get(v, String(k));
            } else return v;
        }
    }
    function unary(): unknown {
        return primary();
    }
    function cmp(): unknown {
        let l = unary();
        while (peek()?.t === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(peek().v)) {
            const op = eat().v;
            const r = unary();
            if (op === "==") l = looseEq(l, r);
            else if (op === "!=") l = !looseEq(l, r);
            else if (op === "<") l = toNum(l) < toNum(r);
            else if (op === ">") l = toNum(l) > toNum(r);
            else if (op === "<=") l = toNum(l) <= toNum(r);
            else l = toNum(l) >= toNum(r);
        }
        return l;
    }
    function and(): unknown {
        let l = cmp();
        while (peek()?.v === "&&") {
            eat();
            const r = cmp();
            l = truthy(l) ? r : l;
        }
        return l;
    }
    function or(): unknown {
        let l = and();
        while (peek()?.v === "||") {
            eat();
            const r = and();
            l = truthy(l) ? l : r;
        }
        return l;
    }
    const v = or();
    if (p !== toks.length) throw new Error(`trailing tokens in ${src}`);
    return v;
}

/** A workflow value: `${{ }}` interpolation into a string, or the bare expression's value. */
export function interpolate(value: unknown, ctx: Context, status?: Status): unknown {
    if (typeof value !== "string") return value;
    const whole = /^\s*\$\{\{([\s\S]*?)\}\}\s*$/.exec(value);
    if (whole && !whole[1].includes("}}")) return evaluateExpr(whole[1], ctx, status);
    return value.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, e) => stringify(evaluateExpr(e, ctx, status)));
}

/** An `if:` condition, which may omit `${{ }}`; status functions default to success(). */
export function condition(value: unknown, ctx: Context, status: Status): boolean {
    if (value === undefined) return !status.failed && !status.cancelled;
    const src = String(value).trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1");
    const usesStatus = /\b(success|failure|cancelled|always)\s*\(/.test(src);
    const result = truthy(evaluateExpr(src, ctx, status));
    return usesStatus ? result : result && !status.failed && !status.cancelled;
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Workflow = any;

export const loadWorkflow = (file: string): Workflow => parse(fs.readFileSync(path.join(workflowDir, file), "utf-8"));

/** Evaluates a caller job's `with:` into the called workflow's `inputs`, applying declared defaults. */
export function callInputs(callerFile: string, callerJob: string, ctx: Context): Record<string, unknown> {
    const caller = loadWorkflow(callerFile).jobs[callerJob];
    const called = loadWorkflow(String(caller.uses).replace("./.github/workflows/", ""));
    const declared = called.on?.workflow_call?.inputs ?? {};
    const inputs: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries<{ default?: unknown; }>(declared)) inputs[name] = spec.default ?? null;
    for (const [name, value] of Object.entries(caller.with ?? {})) {
        if (!(name in declared)) throw new Error(`${callerJob} passes undeclared input ${name}`);
        inputs[name] = stringify(interpolate(value, ctx));
    }
    return inputs;
}

/** Evaluates a reusable workflow's `workflow_call` outputs from its jobs' outputs. */
export function callOutputs(file: string, jobs: Record<string, { outputs: Record<string, string>; }>) {
    const decl = loadWorkflow(file).on.workflow_call.outputs ?? {};
    return Object.fromEntries(
        Object.entries<{ value: string; }>(decl).map(([k, v]) => [k, stringify(interpolate(v.value, { jobs }))]),
    );
}

export interface StepResult {
    name: string;
    id?: string;
    skipped: boolean;
    status: number | null;
    output: string;
    outputs: Record<string, string>;
}

export interface JobResult {
    steps: StepResult[];
    outputs: Record<string, string>;
    failed: boolean;
    step: (name: string) => StepResult;
}

function readOutputs(file: string) {
    const out: Record<string, string> = {};
    for (const line of fs.readFileSync(file, "utf-8").split("\n").filter(Boolean)) {
        const i = line.indexOf("=");
        out[line.slice(0, i)] = line.slice(i + 1);
    }
    return out;
}

function actionsEnv(ctx: Context, tmp: string): Record<string, string> {
    const github = (ctx.github ?? {}) as Record<string, unknown>;
    const eventPath = path.join(tmp, "event.json");
    fs.writeFileSync(eventPath, JSON.stringify(github.event ?? {}));
    return {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: stringify(github.event_name),
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: stringify(github.repository),
        GITHUB_REF: stringify(github.ref),
        GITHUB_SHA: stringify(github.sha),
        GITHUB_API_URL: stringify(github.api_url),
    };
}

interface ExecRequest {
    script: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
}
interface ExecResult {
    status: number | null;
    output: string;
}
const bashArgs = (script: string) => ["--noprofile", "--norc", "-eo", "pipefail", "-c", script];

function execSync(req: ExecRequest): ExecResult {
    const r = spawnSync("bash", bashArgs(req.script), { cwd: req.cwd, env: req.env, encoding: "utf-8" });
    return { status: r.status, output: r.stdout + r.stderr };
}

/** Runs bash without blocking the event loop, so an in-process fake API can answer it. */
function execAsync(req: ExecRequest): Promise<ExecResult> {
    return new Promise((resolve) => {
        const child = spawn("bash", bashArgs(req.script), { cwd: req.cwd, env: req.env });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (status) => resolve({ status, output }));
    });
}

export interface RunJobOptions {
    /** Extra environment applied after each step's own `env` (a misconfigured caller, a PATH shim). */
    stepEnv?: Record<string, Record<string, string>>;
    /** Run only this step; the others are reported as skipped. */
    only?: string;
}

/** The runner loop, written once and driven either synchronously or asynchronously. */
function* jobSteps(
    file: string,
    jobName: string,
    ctx: Context,
    cwd: string,
    baseEnv: NodeJS.ProcessEnv,
    opts: RunJobOptions,
): Generator<ExecRequest, JobResult, ExecResult> {
    const job = loadWorkflow(file).jobs[jobName];
    if (!job) throw new Error(`${file} has no job ${jobName}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wf-job-"));
    const status: Status = { failed: false, cancelled: false };
    const steps: StepResult[] = [];
    const stepsCtx: Record<string, { outputs: Record<string, string>; outcome: string; }> = {};
    try {
        for (const [n, step] of (job.steps as Record<string, unknown>[]).entries()) {
            const name = String(step.name ?? step.uses ?? `step-${n}`);
            const scope = { ...ctx, steps: stepsCtx };
            const id = step.id as string | undefined;
            if (!step.run || (opts.only && opts.only !== name) || !condition(step.if, scope, status)) {
                steps.push({ name, id, skipped: true, status: null, output: "", outputs: {} });
                if (id) stepsCtx[id] = { outputs: {}, outcome: "skipped" };
                continue;
            }
            const outputFile = path.join(tmp, `output-${n}`);
            fs.writeFileSync(outputFile, "");
            const env: NodeJS.ProcessEnv = {
                ...baseEnv,
                ...actionsEnv(ctx, tmp),
                GITHUB_OUTPUT: outputFile,
                GITHUB_STEP_SUMMARY: path.join(tmp, `summary-${n}`),
            };
            for (const [k, v] of Object.entries(step.env ?? {})) env[k] = stringify(interpolate(v, scope, status));
            Object.assign(env, opts.stepEnv?.[name]);
            const r = yield { script: stringify(interpolate(step.run, scope, status)), cwd, env };
            const outputs = readOutputs(outputFile);
            steps.push({ name, id, skipped: false, status: r.status, output: r.output, outputs });
            if (id) stepsCtx[id] = { outputs, outcome: r.status === 0 ? "success" : "failure" };
            if (r.status !== 0 && !step["continue-on-error"]) status.failed = true;
        }
        const outputs = Object.fromEntries(
            Object.entries(job.outputs ?? {}).map((
                [k, v],
            ) => [k, stringify(interpolate(v, { ...ctx, steps: stepsCtx }))]),
        );
        return {
            steps,
            outputs,
            failed: status.failed,
            step: (name: string) => {
                const s = steps.find((x) => x.name === name);
                if (!s) throw new Error(`no step ${name}`);
                return s;
            },
        };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

/** Runs every `run:` step of a job in order, honouring `if:`, step outputs and failure propagation. */
export function runJobSync(
    file: string,
    job: string,
    ctx: Context,
    cwd: string,
    env: NodeJS.ProcessEnv,
    opts: RunJobOptions = {},
): JobResult {
    const gen = jobSteps(file, job, ctx, cwd, env, opts);
    let next = gen.next();
    while (!next.done) next = gen.next(execSync(next.value));
    return next.value;
}

/** As runJobSync, but keeps the event loop free for an in-process fake API server. */
export async function runJob(
    file: string,
    job: string,
    ctx: Context,
    cwd: string,
    env: NodeJS.ProcessEnv,
    opts: RunJobOptions = {},
): Promise<JobResult> {
    const gen = jobSteps(file, job, ctx, cwd, env, opts);
    let next = gen.next();
    while (!next.done) next = gen.next(await execAsync(next.value));
    return next.value;
}
