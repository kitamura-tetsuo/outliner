/**
 * An in-process stand-in for the GitHub REST endpoints the corrected-head
 * handoff uses, backed by a fixture's bare Git remote.
 *
 * Branch heads (git refs and PR heads) are read live from the remote, the way
 * GitHub derives them, unless a test overrides them to model lag or a race.
 * A workflow_dispatch creates a run on the commit the branch names *at that
 * moment*, titled by evaluating ci.yml's real `run-name` with the dispatched
 * inputs. Every request is recorded, so tests can assert which mutations were
 * (not) sent.
 */
import { spawnSync } from "child_process";
import http from "http";
import type { AddressInfo } from "net";
import { interpolate, loadWorkflow, stringify } from "./workflow-harness";

export interface FakePull {
    number: number;
    state: "open" | "closed";
    headRef: string;
    headRepo: string | null;
    /** Overrides the live branch head (e.g. a PR record that lags a push). */
    headSha?: string;
    baseRef: string;
    labels: string[];
}

export interface FakeRun {
    id: number;
    workflow: string;
    event: string;
    status: string;
    conclusion: string | null;
    head_sha: string;
    head_branch: string;
    display_title: string;
    html_url: string;
    pull_requests: { number: number; }[];
    /** Fake-only: what the dispatch asked for. */
    inputs?: Record<string, string>;
}

export interface RecordedRequest {
    method: string;
    path: string;
    body?: Record<string, unknown>;
}

export type DispatchMode = "create" | "reject" | "approval" | "silent";

export class FakeGitHub {
    pulls = new Map<number, FakePull>();
    runs: FakeRun[] = [];
    requests: RecordedRequest[] = [];
    dispatchMode: DispatchMode = "create";
    /** Awaited before a request is answered: a barrier for ordering races. */
    beforeRequest?: (req: RecordedRequest) => void | Promise<void>;
    url = "";
    private server?: http.Server;
    private nextRun = 1000;

    constructor(
        readonly repository: string,
        private readonly remote: string,
        private readonly env: NodeJS.ProcessEnv,
    ) {}

    branchHead(ref: string): string {
        const r = spawnSync("git", [
            "--git-dir",
            this.remote,
            "rev-parse",
            "--verify",
            "-q",
            `refs/heads/${ref}^{commit}`,
        ], {
            env: this.env,
            encoding: "utf-8",
        });
        return r.status === 0 ? r.stdout.trim() : "";
    }

    addRun(run: Partial<FakeRun> & Pick<FakeRun, "head_sha" | "event">): FakeRun {
        const id = this.nextRun++;
        const full: FakeRun = {
            id,
            workflow: "ci.yml",
            status: "queued",
            conclusion: null,
            head_branch: "",
            display_title: "CI",
            html_url: `https://github.example/${this.repository}/actions/runs/${id}`,
            pull_requests: [],
            ...run,
        };
        this.runs.push(full);
        return full;
    }

    /** Requests that would change repository, PR or Actions state. */
    mutations = () => this.requests.filter((r) => r.method !== "GET");

    async start() {
        this.server = http.createServer((req, res) => {
            let raw = "";
            req.on("data", (d) => (raw += d));
            req.on("end", async () => {
                const record: RecordedRequest = {
                    method: req.method ?? "GET",
                    path: req.url ?? "",
                    body: raw ? JSON.parse(raw) : undefined,
                };
                this.requests.push(record);
                await this.beforeRequest?.(record);
                const [status, body] = this.route(record);
                res.writeHead(status, { "content-type": "application/json" });
                res.end(body === undefined ? "" : JSON.stringify(body));
            });
        });
        await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
        this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
        return this;
    }

    async stop() {
        await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    }

    private route({ method, path, body }: RecordedRequest): [number, unknown] {
        const url = new URL(path, "http://fake");
        const prefix = `/repos/${this.repository}`;
        if (!url.pathname.startsWith(`${prefix}/`)) return [404, { message: "Not Found" }];
        const rest = url.pathname.slice(prefix.length);
        let m: RegExpExecArray | null;
        if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(rest))) {
            const pr = this.pulls.get(Number(m[1]));
            if (!pr) return [404, { message: "Not Found" }];
            return [200, {
                number: pr.number,
                state: pr.state,
                head: {
                    ref: pr.headRef,
                    sha: pr.headSha ?? this.branchHead(pr.headRef),
                    repo: pr.headRepo === null ? null : { full_name: pr.headRepo },
                },
                base: { ref: pr.baseRef, sha: this.branchHead(pr.baseRef) },
                labels: pr.labels.map((name) => ({ name })),
            }];
        }
        if (method === "GET" && (m = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
            const ref = m[1].split("/").map(decodeURIComponent).join("/");
            const sha = this.branchHead(ref);
            return sha
                ? [200, { ref: `refs/heads/${ref}`, object: { type: "commit", sha } }]
                : [404, { message: "Not Found" }];
        }
        if (method === "GET" && (m = /^\/actions\/workflows\/([^/]+)\/runs$/.exec(rest))) {
            const workflow = decodeURIComponent(m[1]);
            const headSha = url.searchParams.get("head_sha");
            const runs = this.runs.filter((r) => r.workflow === workflow && (!headSha || r.head_sha === headSha));
            return [200, { total_count: runs.length, workflow_runs: runs.map(({ inputs: _, ...r }) => r) }];
        }
        if (method === "POST" && (m = /^\/actions\/workflows\/([^/]+)\/dispatches$/.exec(rest))) {
            const workflow = decodeURIComponent(m[1]);
            if (this.dispatchMode === "reject") return [403, { message: "Resource not accessible by integration" }];
            const ref = String(body?.ref ?? "");
            const sha = this.branchHead(ref);
            if (!sha) return [422, { message: `No ref found for: ${ref}` }];
            const inputs = (body?.inputs ?? {}) as Record<string, string>;
            if (this.dispatchMode !== "silent") {
                const declared = loadWorkflow(workflow).on.workflow_dispatch?.inputs ?? {};
                const ctxInputs = Object.fromEntries(
                    Object.entries<{ default?: string; }>(declared).map(([k, v]) => [k, inputs[k] ?? v.default ?? ""]),
                );
                const title = stringify(interpolate(loadWorkflow(workflow)["run-name"] ?? "", { inputs: ctxInputs }))
                    .trim();
                this.addRun({
                    workflow,
                    event: "workflow_dispatch",
                    head_sha: sha,
                    head_branch: ref,
                    display_title: title || "CI",
                    inputs,
                    ...(this.dispatchMode === "approval" ? { status: "completed", conclusion: "action_required" } : {}),
                });
            }
            return [204, undefined];
        }
        return [404, { message: "Not Found" }];
    }
}
